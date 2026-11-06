#!/usr/bin/env python3
"""Build viewer/fhir-r4-elements.json from the FHIR R4 core package.

The XML to JSON conversion in viewer/fhir-xml.js needs, per element, its type and
whether it repeats. That comes from the snapshots of the base StructureDefinitions.

Usage: python3 -I tools/build-fhir-r4-elements.py [package dir] > viewer/fhir-r4-elements.json
Default package dir: ~/.fhir/packages/hl7.fhir.r4.core#4.0.1/package
"""
import json
import os
import sys

pkg = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.fhir/packages/hl7.fhir.r4.core#4.0.1/package')

NUMBER = {'integer', 'positiveInt', 'unsignedInt', 'decimal', 'integer64'}

elements = {}
primitives = {}
for name in sorted(os.listdir(pkg)):
    if not name.startswith('StructureDefinition-'):
        continue
    with open(os.path.join(pkg, name)) as f:
        sd = json.load(f)
    if sd.get('derivation') == 'constraint' or sd.get('kind') == 'logical':
        continue
    if sd.get('kind') == 'primitive-type':
        primitives[sd['type']] = 'b' if sd['type'] == 'boolean' else 'n' if sd['type'] in NUMBER else 's'
        continue
    for el in sd.get('snapshot', {}).get('element', []):
        path = el['path']
        if '.' not in path:
            continue
        repeats = 1 if el.get('max') not in ('0', '1') else 0
        if 'contentReference' in el:
            t = el['contentReference']  # '#Bundle.link'
        else:
            codes = [t['code'] for t in el.get('type', [])]
            codes = ['s' if c.startswith('http://hl7.org/fhirpath/System.') else c for c in codes]
            if codes in (['BackboneElement'], ['Element']) and any(
                    e['path'].startswith(path + '.') for e in sd['snapshot']['element']):
                t = '.'  # children are defined under this path
            else:
                t = codes if len(codes) > 1 or path.endswith('[x]') else (codes[0] if codes else 's')
        elements[path] = [t, repeats]

json.dump({'primitives': primitives, 'elements': elements}, sys.stdout, separators=(',', ':'), sort_keys=True)
