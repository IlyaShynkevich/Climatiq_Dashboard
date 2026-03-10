# Climatiq Dashboard

Climatiq Dashboard is a static web app for exploring a business's monthly operational emissions. It converts electricity, gas, and travel activity into emissions, summarizes the footprint, projects the next quarter, and recommends dataset-specific reduction actions.

## Features

- Manual monthly data entry for electricity, gas, and travel
- CSV import with validation for `month,electricity,gas,travel`
- Automatic emissions calculation for each month
- Summary KPI cards for total emissions, average monthly emissions, and highest source
- Trend and category charts for historical emissions
- Baseline forecast for the next 3 months
- Dataset-driven recommendation cards with projected scenario impacts

## Project Structure

- `index.html` - page structure and dashboard layout
- `styles.css` - dashboard styling and responsive layout
- `app.js` - emissions logic, forecasting, recommendations, and interaction handling
- `Samples/` - example CSV inputs for testing outside the main dashboard UI

## How To Run

This project has no build step and no dependencies.

### Option 1: Open directly

Open `index.html` in your browser.

### Option 2: Run a local server

From the project folder:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## How It Works

1. Enter monthly activity data manually or import a CSV file.
2. Emissions are calculated with fixed factors in `app.js`:
   - Electricity: `0.4 kg CO2e` per `kWh`
   - Gas: `5.3 kg CO2e` per `therm`
   - Travel: `0.28 kg CO2e` per `mile`
3. The dashboard updates KPI cards and historical charts immediately.
4. The forecast module projects the next 3 months using recent directional change in the loaded dataset.
5. The recommendation module analyzes the dataset and proposes actions based on dominant sources, growth patterns, and seasonal gas behavior.

## Current Recommendation Logic

The recommendation cards are dataset-driven, but heuristic-based rather than machine-learned. The app currently looks for:

- electricity-heavy footprints
- winter gas spikes
- rising or material travel emissions
- mixed-source footprints that need a balanced action package

Each recommendation also includes a projected 3-month scenario outcome so it can be compared with the baseline forecast.
