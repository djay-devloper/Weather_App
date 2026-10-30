# Weatherly

A responsive weather dashboard built with React and Vite. It includes current conditions, three-hour and five-day forecasts, an explainable outdoor-window recommendation, city suggestions, browser geolocation, Celsius/Fahrenheit controls, side-by-side city comparisons, and forecast-based severe-weather notifications.

## Setup

1. Create an OpenWeatherMap API key with access to Current Weather, 5 Day / 3 Hour Forecast, and Geocoding.
2. Copy `.env.sample` to `.env` and set `VITE_API_KEY` to your key.
3. Install dependencies with `npm install`.
4. Start the development server with `npm run dev`.

The API key is used by browser-side requests and is visible to users of a deployed site. Use a server-side proxy if the key must remain private.

## Scripts

- `npm run dev` — start the development server
- `npm run lint` — lint the project
- `npm run build` — create a production build
- `npm run preview` — preview the production build

The outdoor-window recommendation ranks the next 24 hours of three-hour forecast periods using temperature, precipitation probability, wind, and severe condition codes. It is a general planning estimate, not a safety advisory. Severe-weather notices are also estimates, not official emergency alerts. Browser notifications require explicit permission.
