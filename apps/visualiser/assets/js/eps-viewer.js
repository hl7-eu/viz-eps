(function () {
  'use strict';

  var TEMPLATE = './templates/bundleeps.liquid';
  var ELEMENTS = './fhir-r4-elements.json';

  // Escape every {{ value }}: Bundles come from systems under test and are untrusted.
  var engine = new liquidjs.Liquid({ outputEscape: 'escape' });
  engine.registerFilter('pluralize', function (v) {
    return typeof v === 'number' && v !== 1 ? 's' : '';
  });

  var paste = document.getElementById('paste');
  var statusEl = document.getElementById('status');
  var resultEl = document.getElementById('result');
  var dropzone = document.getElementById('dropzone');

  function notice(kind, title, items) {
    var box = document.createElement('div');
    box.className = 'ps-notice' + (kind === 'error' ? ' ps-error' : '');
    var p = document.createElement('p');
    p.className = 'mb-0';
    p.textContent = title;
    box.appendChild(p);
    if (items && items.length) {
      var ul = document.createElement('ul');
      items.forEach(function (text) {
        var li = document.createElement('li');
        li.textContent = text;
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    statusEl.appendChild(box);
  }

  function clear() {
    statusEl.replaceChildren();
    resultEl.replaceChildren();
  }

  function walk(node, visit) {
    if (Array.isArray(node)) {
      node.forEach(function (child) { walk(child, visit); });
    } else if (node && typeof node === 'object') {
      visit(node);
      Object.keys(node).forEach(function (key) { walk(node[key], visit); });
    }
  }

  // The templates resolve references only on an exact fullUrl match.
  // Rewrite relative and absolute references to the fullUrl of the entry they point to.
  function normalizeReferences(bundle) {
    var fullUrls = new Set();
    var byTypeAndId = new Map();
    (bundle.entry || []).forEach(function (e) {
      if (!e || !e.fullUrl) return;
      fullUrls.add(e.fullUrl);
      if (e.resource && e.resource.resourceType && e.resource.id) {
        byTypeAndId.set(e.resource.resourceType + '/' + e.resource.id, e.fullUrl);
      }
    });
    var rewritten = 0;
    walk(bundle, function (obj) {
      if (typeof obj.reference !== 'string' || fullUrls.has(obj.reference)) return;
      // Anchored on a slash or the start, so a long reference cannot backtrack quadratically.
      var m = obj.reference.match(/(?:^|\/)([A-Za-z]+\/[A-Za-z0-9\-.]{1,64})(\/_history\/[^/]+)?$/);
      if (m && byTypeAndId.has(m[1])) {
        obj.reference = byTypeAndId.get(m[1]);
        rewritten++;
      }
    });
    return { fullUrls: fullUrls, rewritten: rewritten };
  }

  function unresolvedSectionEntries(composition, fullUrls) {
    var missing = [];
    function check(sections) {
      (sections || []).forEach(function (sec) {
        (sec.entry || []).forEach(function (ent) {
          if (ent.reference && !fullUrls.has(ent.reference)) {
            missing.push((sec.title || 'Section') + ': ' + ent.reference);
          }
        });
        check(sec.section);
      });
    }
    check(composition.section);
    return missing;
  }

  // Narrative XHTML comes from the system under test: sanitize it, and drop inline styles,
  // classes (Bootstrap utilities such as position-fixed) and ids and names, so it cannot
  // overlay the page or clobber its elements.
  var PURIFY = {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style', 'class', 'id', 'name'],
    RETURN_DOM_FRAGMENT: true
  };
  DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  function narrativeBox(title, div, emptyText) {
    var box = document.createElement('div');
    box.className = 'ps-narrative';
    if (title) {
      var h = document.createElement('div');
      h.className = 'ps-narrative-title';
      h.textContent = title;
      box.appendChild(h);
    }
    if (div) {
      box.appendChild(DOMPurify.sanitize(div, PURIFY));
    } else {
      var p = document.createElement('p');
      p.className = 'ps-narrative-empty';
      p.textContent = emptyText;
      box.appendChild(p);
    }
    return box;
  }

  function addNarratives(bundle, composition) {
    var byUrl = new Map();
    (bundle.entry || []).forEach(function (e) {
      if (e && e.fullUrl && e.resource) byUrl.set(e.fullUrl, e.resource);
    });

    // Per resource: behind a toggle below its card.
    resultEl.querySelectorAll('.ps-entry[data-ps-ref]').forEach(function (wrap) {
      var res = byUrl.get(wrap.getAttribute('data-ps-ref'));
      if (!res || !res.text || !res.text.div) return;
      var details = document.createElement('details');
      details.className = 'ps-resource-narrative';
      var summary = document.createElement('summary');
      summary.textContent = 'Narrative of this ' + res.resourceType;
      details.appendChild(summary);
      details.appendChild(narrativeBox(null, res.text.div));
      wrap.appendChild(details);
    });

    // Per section: data and narrative side by side. The template puts a label per section
    // directly in the result; sub-section labels carry an inline style.
    var labels = Array.prototype.filter.call(resultEl.children, function (el) {
      return el.classList.contains('eps-section-label') && !el.hasAttribute('style');
    });
    (composition.section || []).forEach(function (sec, i) {
      var label = labels[i];
      if (!label) return;
      var row = document.createElement('div');
      row.className = 'ps-section-row';
      var data = document.createElement('div');
      data.className = 'ps-data';
      var next = label.nextElementSibling;
      while (next && labels.indexOf(next) === -1) {
        var move = next;
        next = next.nextElementSibling;
        data.appendChild(move);
      }
      var narrative = narrativeBox('Narrative', sec.text && sec.text.div, 'No narrative in this section.');
      (sec.section || []).forEach(function (sub) {
        narrative.appendChild(narrativeBox(sub.title || 'Sub-section', sub.text && sub.text.div, 'No narrative.'));
      });
      row.appendChild(data);
      row.appendChild(narrative);
      label.after(row);
    });

    // Composition.text, if any, above the first section.
    if (composition.text && composition.text.div && labels[0]) {
      var details = document.createElement('details');
      details.className = 'ps-resource-narrative mb-3';
      var summary = document.createElement('summary');
      summary.textContent = 'Narrative of the Composition';
      details.appendChild(summary);
      details.appendChild(narrativeBox(null, composition.text.div));
      labels[0].before(details);
    }
  }

  // XML is converted to FHIR JSON first; the templates only know JSON.
  function parse(trimmed) {
    if (trimmed.charAt(0) !== '<') {
      try {
        return Promise.resolve({ bundle: JSON.parse(trimmed), issues: [] });
      } catch (e) {
        return Promise.reject(new Error('This is not valid JSON: ' + e.message));
      }
    }
    return FhirXml.load(ELEMENTS).then(function () {
      try {
        var result = FhirXml.toJson(trimmed);
        return { bundle: result.resource, issues: result.issues };
      } catch (e) {
        throw new Error('This is not valid XML: ' + e.message);
      }
    });
  }

  function render(text, sourceName) {
    clear();
    var trimmed = (text || '').trim();
    if (!trimmed) {
      notice('error', 'Nothing to show: paste a Bundle or choose a file.');
      return;
    }
    parse(trimmed).then(function (parsed) {
      show(parsed, sourceName);
    }, function (e) {
      notice('error', e.message);
    });
  }

  function show(parsed, sourceName) {
    var bundle = parsed.bundle;
    if (parsed.issues.length) {
      notice('warning', 'Converted from XML with ' + parsed.issues.length + ' issue(s):', parsed.issues.slice(0, 20));
    }
    if (!bundle || bundle.resourceType !== 'Bundle') {
      notice('error', 'Expected a Bundle, got ' + (bundle.resourceType || 'no resourceType') + '.');
      return;
    }
    var entries = bundle.entry || [];
    var compEntry = entries.find(function (e) { return e && e.resource && e.resource.resourceType === 'Composition'; });
    if (!compEntry) {
      notice('error', 'This Bundle has no Composition, so it is not a document.');
      return;
    }

    var refs = normalizeReferences(bundle);
    var warnings = [];
    if (entries[0] !== compEntry) {
      warnings.push('The Composition is not the first entry of the Bundle.');
    }
    if (refs.rewritten) {
      warnings.push(refs.rewritten + ' reference(s) did not match a fullUrl literally and were resolved on resource type and id.');
    }
    var missing = unresolvedSectionEntries(compEntry.resource, refs.fullUrls);
    if (missing.length) {
      warnings.push(missing.length + ' section entry reference(s) point to nothing in the Bundle and are not shown:');
    }
    if (warnings.length) {
      notice('warning', (sourceName ? sourceName + ': ' : '') + warnings.join(' '), missing);
    }

    fetch(TEMPLATE)
      .then(function (res) {
        if (!res.ok) throw new Error('Template not found (' + res.status + ')');
        return res.text();
      })
      .then(function (template) { return engine.parseAndRender(template, bundle); })
      .then(function (html) {
        // Safe because every value is escaped by the engine; the markup comes from our templates.
        resultEl.innerHTML = html;
        addNarratives(bundle, compEntry.resource);
        resultEl.querySelector('*') && resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (e) {
        notice('error', 'Rendering failed: ' + e.message);
      });
  }

  function readFile(file) {
    if (!file) return;
    file.text().then(function (text) {
      paste.value = text;
      render(text, file.name);
    });
  }

  document.getElementById('show').addEventListener('click', function () {
    render(paste.value);
  });

  document.getElementById('file').addEventListener('change', function (ev) {
    readFile(ev.target.files[0]);
    ev.target.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (type) {
    dropzone.addEventListener(type, function (ev) {
      ev.preventDefault();
      dropzone.classList.add('ps-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    dropzone.addEventListener(type, function () {
      dropzone.classList.remove('ps-dragover');
    });
  });
  dropzone.addEventListener('drop', function (ev) {
    ev.preventDefault();
    readFile(ev.dataTransfer.files[0]);
  });

  // ?url= as before: a Bundle on a FHIR server is read as JSON.
  var url = window.location.search.split('url=')[1];
  if (url) {
    var urlsplit = url.split('/Bundle/');
    if (urlsplit[1]) {
      url = urlsplit[0] + '/Bundle/' + urlsplit[1] + '?_format=json';
    }
    fetch(url, { headers: { Accept: 'application/fhir+json' } })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        return res.text();
      })
      .then(function (text) { render(text); })
      .catch(function (e) { notice('error', 'Could not load ' + url + ': ' + e.message); });
  }
})();
