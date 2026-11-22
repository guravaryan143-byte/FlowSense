# Third-Party Licenses

This file records major direct dependencies and license identifiers observed in the installed package metadata or package manifests. It is not a grant of third-party rights and does not replace the official license text distributed by each dependency.

## Backend direct dependencies

Package metadata and the pinned requirements should be reviewed together:

| Package | Observed license |
|---|---|
| FastAPI | MIT |
| SQLAlchemy | MIT |
| Alembic | MIT |
| Pydantic | MIT |
| psycopg | LGPL-3.0 |
| PyJWT | MIT |
| Argon2-cffi | MIT |
| scikit-learn | BSD-3-Clause |
| pandas | BSD-3-Clause |
| NumPy | BSD-3-Clause |
| joblib | BSD-3-Clause |
| Matplotlib | PSF-based BSD |
| pytest | MIT |

The exact license field for psycopg-family packages must be confirmed from the package's official distribution metadata.

## Frontend direct dependencies

| Package | Version | License source |
|---|---|---|
| React | 18.3.1 | package manifest |
| React DOM | 18.3.1 | package manifest |
| React Router DOM | 6.30.6 | package manifest; two moderate advisories open |
| Axios | 1.21.1 | package manifest |
| Leaflet | 1.9.4 | package manifest |
| Recharts | 3.10.1 | package manifest |
| Tailwind CSS | 3.4.19 | package manifest |
| Lucide React | 0.577.0 | package manifest |
| Fontsource packages | 5.x | package manifest |

Official license sources and transitive dependency license texts must be retained before a public release.
