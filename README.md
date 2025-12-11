# Ura Design Website

A modern, multilingual website built with **Astro 5** (SSR) and **Directus CMS**, featuring Redis caching, PostgreSQL database, and Docker deployment.

## Tech Stack

| Component | Technology                |
| --------- | ------------------------- |
| Frontend  | Astro 5.0.5 (SSR mode)    |
| Styling   | TailwindCSS v4            |
| CMS       | Directus 11.13.3          |
| Database  | PostgreSQL 18             |
| Cache     | Redis 8.2.3               |
| Language  | TypeScript 5.6.3          |
| i18n      | English (en), German (de) |

## Prerequisites

- **Node.js** >= 18.20.8
- **Docker** & **Docker Compose**
- **Git**

## Project Structure

```
├── src/
│   ├── components/       # Astro components
│   ├── layouts/          # Page layouts
│   ├── lib/              # Core libraries (CMS, Redis, i18n)
│   ├── pages/            # Astro pages (routes)
│   │   ├── api/          # API endpoints (contact, weather)
│   │   ├── en/           # English pages
│   │   └── de/           # German pages
│   ├── scripts/          # Client-side scripts
│   └── styles/           # Global styles
├── public/               # Static assets (fonts, images)
├── scripts/              # Build & sync scripts
├── docker-compose.yml    # Development stack
├── docker-compose.prod.yml # Production stack
└── Dockerfile            # Astro production build
```

---

## Local Development

### 1. Clone & Install Dependencies

```bash
git clone <repository-url>
cd uradotdesign
npm install
```

### 2. Configure Environment

Copy the example environment file and customize:

```bash
cp env.example .env
```

Edit `.env` with your values:

```bash
# Directus URLs
PUBLIC_DIRECTUS_URL=http://localhost:8055
DIRECTUS_URL=http://localhost:8055

# Site URL
PUBLIC_URL=http://localhost:3000

# Directus Admin Credentials
KEY=your-random-uuid-here
SECRET=your-random-secret-here
ADMIN_EMAIL=admin@ura.design
ADMIN_PASSWORD=your-secure-password

# Database
POSTGRES_USER=directus
POSTGRES_PASSWORD=directus
POSTGRES_DB=directus

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://redis:6379

# Weather API (optional - get key at https://openweathermap.org/api)
OPENWEATHER_API_KEY=your-api-key-here
WEATHER_LOCATION=Berlin
WEATHER_CACHE_TTL=900

# i18n
DEFAULT_LOCALE=en
AVAILABLE_LOCALES=en,de
```

### 3. Start Backend Services

Start PostgreSQL, Redis, and Directus:

```bash
npm run directus:start
# or
docker-compose up -d
```

Wait for all services to be healthy (check with `docker-compose ps`).

Directus will be available at: **http://localhost:8055**

### 4. Start Astro Development Server

```bash
npm run dev
```

The site will be available at: **http://localhost:3000**

### Development Commands

| Command                  | Description                        |
| ------------------------ | ---------------------------------- |
| `npm run dev`            | Start Astro dev server (port 3000) |
| `npm run build`          | Build for production               |
| `npm run preview`        | Preview production build           |
| `npm run directus:start` | Start Docker services              |
| `npm run directus:stop`  | Stop Docker services               |
| `npm run directus:logs`  | View Directus logs                 |

---

## Production Deployment

### Option 1: Docker Compose (Recommended)

The production setup uses `docker-compose.prod.yml` which includes:

- Astro (SSR Node.js server)
- Directus CMS
- PostgreSQL
- Redis

#### 1. Configure Production Environment

Create a `.env` file on your server:

```bash
# Domain configuration
DOMAIN_NAME=ura.design

# Directus
KEY=<generate-random-uuid>
SECRET=<generate-random-uuid>
ADMIN_EMAIL=admin@ura.design
ADMIN_PASSWORD=<secure-password>

# Database
POSTGRES_USER=directus
POSTGRES_PASSWORD=<secure-password>
POSTGRES_DB=directus

# Weather API
OPENWEATHER_API_KEY=<your-api-key>
WEATHER_LOCATION=Berlin

# i18n
DEFAULT_LOCALE=en
AVAILABLE_LOCALES=en,de
```

#### 2. Deploy with Docker Compose

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

#### 3. Configure Nginx Reverse Proxy

Example Nginx configuration:

```nginx
# Main site
server {
    listen 443 ssl http2;
    server_name ura.design;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:4321;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Directus CMS
server {
    listen 443 ssl http2;
    server_name cms.ura.design;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:8055;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option 2: Manual Deployment

#### 1. Build Astro

```bash
npm run build
```

This creates a `dist/` folder with:

- `dist/server/` - Node.js server files
- `dist/client/` - Static assets

#### 2. Run the Server

```bash
NODE_ENV=production node ./dist/server/entry.mjs
```

The server runs on port 4321 by default.

---

## CMS Administration

### Accessing Directus

- **Development:** http://localhost:8055
- **Production:** https://cms.your-domain.com

Login with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` credentials.

### Collections Reference

#### Global Settings (Singletons)

| Collection               | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `site_settings`          | Global site configuration (SEO, contact, branding)   |
| `header_settings`        | Header behavior (sticky, blur, weather display)      |
| `footer_settings`        | Footer configuration (newsletter, social, copyright) |
| `hero_section`           | Homepage hero section content                        |
| `about_page`             | About page content and sections                      |
| `contact_section`        | Contact section labels and headings                  |
| `clients_section`        | Clients section heading                              |
| `accessibility_settings` | Accessibility options (skip links, ARIA, focus)      |

#### Content Collections

| Collection                | Description                                       |
| ------------------------- | ------------------------------------------------- |
| `services`                | Service offerings with multilingual content       |
| `service_steps`           | Process steps for each service (O2M → services)   |
| `service_activities`      | Accordion activities per service (O2M → services) |
| `service_checklist_items` | Checklist items per service (O2M → services)      |
| `service_subservices`     | Sub-services list per service (O2M → services)    |
| `case_studies`            | Portfolio case studies                            |
| `case_study_sections`     | Content sections within case studies (O2M)        |
| `case_study_categories`   | Categories for case studies                       |
| `posts`                   | Blog posts                                        |
| `pages`                   | Single-column pages                               |

#### People & Organizations

| Collection     | Description                    |
| -------------- | ------------------------------ |
| `team_members` | Team member profiles and bios  |
| `clients`      | Client logos and information   |
| `testimonials` | Client testimonials and quotes |

#### Navigation & UI

| Collection         | Description                        |
| ------------------ | ---------------------------------- |
| `navigation_links` | Header navigation menu items       |
| `social_links`     | Social media links (footer/header) |

#### About & Company

| Collection       | Description                              |
| ---------------- | ---------------------------------------- |
| `company_values` | Company values (accordion on About page) |
| `approaches`     | Approach methodology cards               |
| `certifications` | Company certifications and awards        |

#### Localization

| Collection     | Description                              |
| -------------- | ---------------------------------------- |
| `translations` | UI string translations (key-value pairs) |

#### Form Submissions

| Collection            | Description                           |
| --------------------- | ------------------------------------- |
| `contact_submissions` | Contact form submissions (write-only) |

### Adding Content

1. Log into Directus admin panel
2. Navigate to the desired collection
3. Create/edit items with both English (`_en`) and German (`_de`) field variants
4. Set `status` to "published" for items to appear on the site

---

## API Endpoints

| Endpoint       | Method | Description             |
| -------------- | ------ | ----------------------- |
| `/api/contact` | POST   | Contact form submission |
| `/api/weather` | GET    | Weather data (cached)   |

### Contact Form

```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "message": "Hello!",
    "contact_preference": "email"
  }'
```

### Weather API

```bash
curl "http://localhost:3000/api/weather?location=Berlin"
```

---

## Caching

The site uses Redis for caching:

- **CMS data:** Cached for 1 hour (configurable via `DIRECTUS_CONFIG_CACHE_TTL`)
- **Weather data:** Cached for 15 minutes (configurable via `WEATHER_CACHE_TTL`)

Cache is automatically invalidated when content changes in Directus.

---

## Internationalization

The site supports English and German with URL-based routing:

- English: `/en/` (default)
- German: `/de/`

Content fields in Directus use suffixes:

- `title_en`, `title_de`
- `description_en`, `description_de`

---

## Troubleshooting

### Directus won't start

Check if PostgreSQL is healthy:

```bash
docker-compose logs postgres
```

### Redis connection errors

Verify Redis is running:

```bash
docker-compose exec redis redis-cli ping
```

### Assets not loading

Verify `PUBLIC_DIRECTUS_URL` is correctly set and accessible from the browser.

---

## Environment Variables Reference

| Variable              | Required | Default                 | Description                   |
| --------------------- | -------- | ----------------------- | ----------------------------- |
| `DIRECTUS_URL`        | Yes      | `http://localhost:8055` | Internal Directus URL (SSR)   |
| `PUBLIC_DIRECTUS_URL` | Yes      | `http://localhost:8055` | Public Directus URL (browser) |
| `KEY`                 | Yes      | -                       | Directus encryption key       |
| `SECRET`              | Yes      | -                       | Directus secret key           |
| `ADMIN_EMAIL`         | Yes      | `admin@ura.design`      | Directus admin email          |
| `ADMIN_PASSWORD`      | Yes      | -                       | Directus admin password       |
| `POSTGRES_USER`       | No       | `directus`              | Database user                 |
| `POSTGRES_PASSWORD`   | No       | `directus`              | Database password             |
| `POSTGRES_DB`         | No       | `directus`              | Database name                 |
| `REDIS_HOST`          | No       | `localhost`             | Redis host                    |
| `REDIS_PORT`          | No       | `6379`                  | Redis port                    |
| `OPENWEATHER_API_KEY` | No       | -                       | OpenWeatherMap API key        |
| `WEATHER_LOCATION`    | No       | `Berlin`                | Default weather location      |
| `DEFAULT_LOCALE`      | No       | `en`                    | Default language              |
| `AVAILABLE_LOCALES`   | No       | `en,de`                 | Supported languages           |

---

## License

Copyright © Ura Design
