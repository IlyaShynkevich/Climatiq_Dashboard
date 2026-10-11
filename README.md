# Climatiq Dashboard

Climatiq Dashboard is a static browser app for exploring monthly operational emissions. It converts electricity, gas, and travel activity into `kg CO2e`, visualizes the footprint, benchmarks multiple forecast models, projects the next quarter, and recommends reduction scenarios based on the uploaded dataset.

**Live demo:** <https://climatiq-dashboard.vercel.app/>

The UI is minimal and Apple-style, built on the climatiq.io palette (white, navy `#050564`, blue `#0600f7`, brand purple `#6a35ff`, lavender `#f3efff`, and a salmon accent). It follows the system light/dark mode automatically.

## What The Dashboard Does

- captures monthly business activity through manual entry or CSV import
- converts activity into emissions with fixed factors for electricity, gas, and travel
- summarizes the footprint with four summary tiles: total, monthly average, largest source, and lowest month
- plots a trend chart with a hover read-out
- breaks emissions down by source in a horizontal category chart
- lists the underlying months in a scrollable data table
- benchmarks several forecasting approaches, selects the best available model, and projects the next 3 months of emissions in the forecast section
- generates recommended actions with current-baseline savings and forecast-baseline savings

## Charts

The trend chart's x-axis thins its labels automatically: every month, then every 2, 3, or 6 months, then years. Dates never overlap, even with long histories. Use `Samples/sample_two_years.csv` or a longer file to see it.

## Forecasting Behavior

The forecast panel changes based on how much dated history is available:

- Fewer than `12` months: forecasting is locked because there is not enough history to infer seasonality.
- `12` to `23` months: the app uses a seasonal-naive fallback that repeats the last full year.
- `24+` months: the app runs a rolling one-step benchmark and compares `Mean`, `Naive`, `Seasonal naive`, `Holt-Winters`, and `Prophet-style` models using `RMSE`, `MAE`, and `MAPE`.

The winning model is then refit on the full dataset and used to forecast the next quarter.

## Recommendation Logic

Recommendations are heuristic-based, not machine-learned. The app looks for:

- electricity-heavy footprints
- winter gas spikes
- rising or material travel emissions
- mixed-source footprints that benefit from a balanced intervention plan

Each recommendation applies category-specific reduction percentages and compares the result against both the current footprint and, when available, the selected 3-month forecast baseline.

## Emission Factors

The current conversion factors in [`app.js`](./app.js) are:

- Electricity: `0.4 kg CO2e` per `kWh`
- Gas: `5.3 kg CO2e` per `therm`
- Travel: `0.28 kg CO2e` per `mile`

## CSV Format

The importer expects this header exactly:

```csv
month,electricity,gas,travel
2025-01,1200,90,450
2025-02,1100,105,420
```

Rules:

- `month` must use `YYYY-MM`
- activity values must be numeric
- negative values are rejected
- blank numeric fields are treated as `0`

## Sample Data

Example datasets are provided in [`Samples/`](./Samples):

- `sample.csv`
- `sample_two_years.csv`
- `sample_growth.csv`
- `sample_winter_heating.csv`
- `sample_travel_heavy.csv`
- `sample_spiky_operations.csv`
- `sample_retrofit.csv`
- `sample_remote_low_footprint.csv`

Use `sample_two_years.csv` if you want to unlock the full forecast benchmark immediately.

## Run Locally

This project has no build step and no package dependencies.

### Option 1: Open Directly

Open [`index.html`](./index.html) in a browser.

### Option 2: Use a Local Server

From the project directory:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Project Structure

- [`index.html`](./index.html): dashboard markup and layout, with no favicon or external font dependency
- [`styles.css`](./styles.css): Climatiq palette as CSS variables, light/dark themes, system font stack, and responsive layout
- [`app.js`](./app.js): state, CSV parsing, emissions math, forecasting, recommendations, canvas charts (colors read from the CSS variables in `styles.css`), and UI rendering
- [`Samples/`](./Samples): sample CSV files for quick testing

## Deploy

The dashboard is a static site with no build step. It is deployed on Vercel with Application Preset `Other` and no build command, output directory, or environment variables. Every push to `main` redeploys.

## Notes

- The dashboard is entirely client-side.
- Forecasting runs on total emissions first, then allocates projected totals back to categories using recent category shares.
- Charts are drawn directly with the Canvas API rather than a charting library.
