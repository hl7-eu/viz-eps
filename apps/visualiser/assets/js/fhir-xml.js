// FHIR R4 XML to FHIR JSON, in the browser.
// Which elements repeat and which type each element has comes from fhir-r4-elements.json,
// generated from the StructureDefinitions in hl7.fhir.r4.core 4.0.1.
var FhirXml = (function () {
  'use strict';

  var FHIR_NS = 'http://hl7.org/fhir';
  var XHTML_NS = 'http://www.w3.org/1999/xhtml';
  var defs = null;

  function load(url) {
    if (defs) return Promise.resolve();
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('FHIR definitions not found (' + res.status + ')');
        return res.json();
      })
      .then(function (json) { defs = json; });
  }

  function upperFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // Find the definition of child `name` in context `ctx` (a type name or a backbone path).
  // Returns { path, type, repeats, key } where key is the JSON property name.
  function lookup(ctx, name) {
    var path = ctx + '.' + name;
    var def = defs.elements[path];
    if (def && !Array.isArray(def[0])) return { path: path, type: def[0], repeats: def[1], key: name };
    // Choice element: valueQuantity -> value[x] with type Quantity.
    for (var i = 1; i < name.length; i++) {
      if (!/[A-Z]/.test(name.charAt(i))) continue;
      var choice = defs.elements[ctx + '.' + name.slice(0, i) + '[x]'];
      if (!choice) continue;
      var suffix = name.slice(i);
      var types = Array.isArray(choice[0]) ? choice[0] : [choice[0]];
      var type = types.find(function (t) { return upperFirst(t) === suffix; });
      if (type) return { path: ctx + '.' + name.slice(0, i) + '[x]', type: type, repeats: choice[1], key: name };
    }
    // Elements every type and backbone inherits.
    if (name === 'extension' || name === 'modifierExtension') {
      return { path: 'Element.' + name, type: 'Extension', repeats: 1, key: name };
    }
    return null;
  }

  function childElements(el) {
    return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1; });
  }

  function primitiveValue(type, raw) {
    var kind = defs.primitives[type] || 's';
    if (kind === 'b') return raw === 'true' ? true : raw === 'false' ? false : raw;
    if (kind === 'n' && raw !== null && raw.trim() !== '' && !isNaN(Number(raw))) return Number(raw);
    return raw;
  }

  function isPrimitive(type) { return type === 's' || defs.primitives.hasOwnProperty(type); }

  function add(obj, def, value, index) {
    if (!def.repeats) {
      obj[def.key] = value;
      return;
    }
    if (!obj[def.key]) obj[def.key] = [];
    if (index !== undefined) {
      while (obj[def.key].length < index) obj[def.key].push(null);
    }
    obj[def.key].push(value);
  }

  function convertResource(el, issues) {
    if (el.namespaceURI !== FHIR_NS) {
      issues.push('Element <' + el.localName + '> is not in the FHIR namespace.');
    }
    var obj = { resourceType: el.localName };
    fill(el, el.localName, obj, issues);
    return obj;
  }

  function fill(el, ctx, obj, issues) {
    var counts = {};
    childElements(el).forEach(function (child) {
      var name = child.localName;
      var def = lookup(ctx, name);
      if (!def) {
        issues.push('Unknown element ' + ctx + '.' + name + ' skipped.');
        return;
      }
      var index = counts[name] = (counts[name] === undefined ? 0 : counts[name] + 1);

      if (def.type === 'xhtml') {
        if (child.namespaceURI !== XHTML_NS) issues.push(ctx + '.' + name + ' is not in the XHTML namespace.');
        add(obj, def, new XMLSerializer().serializeToString(child), index);
        return;
      }
      if (def.type === 'Resource') {
        var inner = childElements(child)[0];
        if (inner) add(obj, def, convertResource(inner, issues), index);
        return;
      }
      if (isPrimitive(def.type)) {
        var value = child.hasAttribute('value') ? primitiveValue(def.type, child.getAttribute('value')) : null;
        var ext = {};
        if (child.hasAttribute('id')) ext.id = child.getAttribute('id');
        fill(child, 'Element', ext, issues);
        if (def.repeats) {
          add(obj, def, value, index);
          if (Object.keys(ext).length) {
            add(obj, { key: '_' + def.key, repeats: 1 }, ext, index);
          }
        } else {
          if (value !== null) obj[def.key] = value;
          if (Object.keys(ext).length) obj['_' + def.key] = ext;
        }
        return;
      }
      var complex = {};
      ['id', 'url'].forEach(function (attr) {
        if (child.hasAttribute(attr)) complex[attr] = child.getAttribute(attr);
      });
      var childCtx = def.type === '.' ? def.path
        : def.type.charAt(0) === '#' ? def.type.slice(1)
        : def.type;
      fill(child, childCtx, complex, issues);
      add(obj, def, complex, index);
    });
    // Pad parallel arrays of repeating primitives with extensions.
    Object.keys(obj).forEach(function (key) {
      if (key.charAt(0) === '_' && Array.isArray(obj[key]) && Array.isArray(obj[key.slice(1)])) {
        while (obj[key].length < obj[key.slice(1)].length) obj[key].push(null);
      }
    });
  }

  // Returns { resource, issues }. Throws on XML that does not parse.
  function toJson(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var error = doc.getElementsByTagName('parsererror')[0];
    if (error) throw new Error(error.textContent.trim().split('\n')[0]);
    var issues = [];
    return { resource: convertResource(doc.documentElement, issues), issues: issues };
  }

  return { load: load, toJson: toJson };
})();
