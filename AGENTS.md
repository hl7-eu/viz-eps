## Project

HL7 EU FHIR European Patient Summary (EPS) sandbox — a Docker-based HAPI FHIR server with web apps for browsing, visualizing, and generating FHIR EPS data. Based on [viz-lab](https://github.com/hl7-eu/viz-lab).

## Architecture

```
viz-eps/
├── docker-compose.yml      # HAPI FHIR server + PostgreSQL + ember IG uploader
├── web/                    # Custom HAPI welcome page (served at /custom)
│   ├── welcome.html
│   ├── logo.jpg
│   └── favicon.ico
├── apps/                   # Web apps served by HAPI at /apps
│   ├── index.html          # Landing page (Markdown → HTML via showdown)
│   ├── prodbrowser.html    # EPS Data Browser
│   ├── datagen.html        # Data Generation (nunjucks + PapaParse + Handlebars)
│   ├── server_mgmt.html   # Server management
│   ├── header.html         # Shared header (SSI include)
│   ├── visualiser/         # FHIR resource visualiser using LiquidJS templates
│   │   ├── index.html      # Entry point — takes ?url= param, renders via LiquidJS
│   │   ├── bundle.html     # Bundle-specific viewer
│   │   ├── outcome.html    # OperationOutcome viewer
│   │   ├── templates/      # LiquidJS templates (*.liquid)
│   │   │   ├── bundleeps.liquid
│   │   │   ├── epsobs.liquid
│   │   │   ├── outcome.liquid
│   │   │   ├── dump.liquid
│   │   │   └── debug.liquid
│   │   ├── templates.json  # Maps resourceType → template + FHIR query
│   │   └── resources/      # Sample FHIR Bundles (local test data)
│   ├── assets/             # Shared CSS/JS (Bootstrap, jQuery, LiquidJS)
│   └── config.json.example # Example: { "ig_url": "...", "server_url": "..." }
└── rest.http               # IntelliJ HTTP client requests
```

## Commands

```bash
# Start the full stack (HAPI FHIR + PostgreSQL + ember IG uploader)
docker compose up -d

# Rebuild after docker-compose.yml changes
docker compose up -d --build

# Stop all services
docker compose down

# View logs
docker compose logs -f fhir-server
```

### FHIR Server

- HAPI FHIR on `http://localhost:8279/eps/fhir` (host) / `http://fhir-server:8080/eps/fhir` (internal)
- IGs auto-loaded: `hl7.fhir.eu.eps` v1.0.0-ballot, `hl7.fhir.eu.base` v2.0.0, `hl7.fhir.eu.extensions.r4` v1.3.0, `hl7.fhir.uv.ips` v2.0.0
- PostgreSQL backend: `db:5432`, database `hapi`, user/password `admin/admin`
- Docker containers: `EPS`, `db_vizeps`, `ember-eps`
- Port mapping: `8279:8080`

## Key EPS Resources

The visualiser renders EPS Composition-based Bundles containing:
- **Bundle / Composition** — document wrapper and clinical narrative
- **Patient** — demographic information
- **AllergyIntolerance** — allergies and adverse reactions
- **Condition** — problems, diagnoses
- **Procedure** — surgical and medical procedures
- **MedicationStatement** — medication usage
- **MedicationRequest** — medication prescriptions
- **MedicationDispense** — medication dispenses
- **Observation** — vital signs, lab results, clinical observations
- **CarePlan** — care plans
- **Flag** — clinical flags/warnings
- **Immunization** — vaccination records
- **Device / DeviceUseStatement** — implantable devices
- **ServiceRequest** — diagnostic/clinical service requests
- **Encounter**, **Organization**, **PractitionerRole**, **Coverage** — supporting resources

## Key Files

- `docker-compose.yml` — Full stack config; HAPI env vars, IG installs, volumes
- `apps/visualiser/index.html` — Visualiser entry, reads `?url=` param, renders via LiquidJS template
- `apps/visualiser/templates.json` — Maps resourceType to LiquidJS template + FHIR search query
- `apps/visualiser/templates/bundleeps.liquid` — Main EPS Bundle rendering template
- `apps/visualiser/templates/epsobs.liquid` — Observation sub-template
- `apps/config.json.example` — Config template (gitignored: `*config.json`)

## Gotchas

- `config.json` is gitignored (`*config.json` pattern) — copy from `config.json.example`
- `data/` directory (PostgreSQL data) and `fhir-outputs/` are gitignored
- The visualiser's `templates.json` query/resourceType mapping is currently hardcoded in `index.html` — the commented-out `$.getJSON('templates.json', ...)` block is not active
- Web apps are served by HAPI via `hapi.fhir.custom_content_path=/custom` and `hapi.fhir.app_content_path=/apps`
- `rest.http` is for IntelliJ HTTP Client (not a plain REST endpoint)
- The project has no build step — it's static HTML/JS served directly by the FHIR server
- CSS uses `eps-` prefix for all custom classes and CSS variables (replacing the old `lab-` prefix)

## Testing

No automated test suite. Manual testing via:
- Browser: `http://localhost:8279/eps/` → welcome page → apps
- EPS Data Browser: `apps/prodbrowser.html` — lists Bundle resources containing Composition entries
- Visualiser: `apps/visualiser/index.html?url=<bundle_url>`
- REST: use `rest.http` in IntelliJ / VS Code REST Client