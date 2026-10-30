import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaBell,
  FaMapMarkerAlt,
  FaSearch,
  FaTimes,
} from "react-icons/fa";
import { WiHumidity, WiStrongWind } from "react-icons/wi";
import axios from "axios";
import "./App.css";

const API_BASE = "https://api.openweathermap.org";
const API_KEY = import.meta.env.VITE_API_KEY?.trim();
const MAX_COMPARISONS = 3;

function getRequestParams(location, units) {
  const params = { appid: API_KEY, units };
  if (typeof location === "string") {
    params.q = location;
  } else {
    params.lat = location.lat;
    params.lon = location.lon;
  }
  return params;
}

async function getWeather(location, units) {
  const params = getRequestParams(location, units);
  const [currentResponse, forecastResponse] = await Promise.all([
    axios.get(`${API_BASE}/data/2.5/weather`, { params }),
    axios.get(`${API_BASE}/data/2.5/forecast`, { params }),
  ]);
  return {
    current: currentResponse.data,
    forecast: forecastResponse.data,
    location,
  };
}

function getErrorMessage(error) {
  if (!API_KEY) return "Add your OpenWeatherMap key as VITE_API_KEY to load weather.";
  if (error.response?.status === 404) return "We couldn't find that city. Try another spelling or include the country.";
  if (error.response?.status === 401) return "The weather service rejected the API key. Check your VITE_API_KEY.";
  if (!error.response) return "Couldn't reach the weather service. Check your connection and try again.";
  return "Weather data couldn't be loaded. Please try again.";
}

function getTemperature(value, units) {
  return `${Math.round(value)}°${units === "metric" ? "C" : "F"}`;
}

function getWindSpeed(value, units) {
  return units === "metric"
    ? `${Math.round(value * 3.6)} km/h`
    : `${Math.round(value)} mph`;
}

function formatCityTime(timestamp, timezoneOffset, options) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    hour12: true,
    timeZone: "UTC",
  }).format(new Date((timestamp + timezoneOffset) * 1000));
}

function getDailyForecast(forecast) {
  const days = new Map();
  forecast.list.forEach((item) => {
    const date = new Date(
      (item.dt + forecast.city.timezone) * 1000,
    ).toISOString().slice(0, 10);
    const day = days.get(date) ?? {
      date,
      min: item.main.temp_min,
      max: item.main.temp_max,
      icon: item.weather[0],
    };
    day.min = Math.min(day.min, item.main.temp_min);
    day.max = Math.max(day.max, item.main.temp_max);
    if (new Date((item.dt + forecast.city.timezone) * 1000).getUTCHours() === 12) {
      day.icon = item.weather[0];
    }
    days.set(date, day);
  });
  return [...days.values()].slice(0, 5);
}

function getBestOutdoorWindow(weather, units) {
  const slots = weather.forecast.list.slice(0, 8);
  if (slots.length === 0) return null;

  const tempToCelsius = (value) => units === "metric" ? value : (value - 32) * 5 / 9;
  const windToMetersPerSecond = (value) => units === "metric" ? value : value * 0.44704;
  const currentTemperature = tempToCelsius(weather.current.main.temp);
  const currentWind = windToMetersPerSecond(weather.current.wind.speed);

  const candidates = slots.map((item, index) => {
    const temperature = tempToCelsius(item.main.temp);
    const wind = windToMetersPerSecond(item.wind.speed);
    const rainChance = Math.round((item.pop ?? 0) * 100);
    const rainAmount = item.rain?.["3h"] ?? 0;
    const conditionId = item.weather[0].id;
    const thunderstormPenalty = conditionId >= 200 && conditionId < 300 ? 40 : 0;
    const snowPenalty = conditionId >= 600 && conditionId < 700 ? 15 : 0;
    const temperaturePenalty = Math.abs(temperature - 21) * 2;
    const rainPenalty = rainChance * 0.55 + Math.min(rainAmount * 2, 15);
    const windPenalty = Math.max(0, wind - 4) * 3;
    const score = Math.max(0, Math.round(
      100 - temperaturePenalty - rainPenalty - windPenalty - thunderstormPenalty - snowPenalty,
    ));
    const intervalSeconds = slots[index + 1]
      ? slots[index + 1].dt - item.dt
      : index > 0
        ? item.dt - slots[index - 1].dt
        : 3 * 60 * 60;

    return {
      item,
      temperature,
      wind,
      rainChance,
      score,
      reasons: [
        temperature >= 16 && temperature <= 27
          ? "Comfortable temperature"
          : temperature < 16 ? "Cooler conditions" : "Warmer conditions",
        rainChance < 25 ? "Low rain chance" : `${rainChance}% rain chance`,
        wind < 5 ? "Light wind" : `${getWindSpeed(item.wind.speed, units)} wind`,
      ],
      start: item.dt,
      end: item.dt + intervalSeconds,
    };
  });

  const best = candidates.reduce((top, candidate) => (
    candidate.score > top.score ? candidate : top
  ));
  const temperatureDifference = best.temperature - currentTemperature;
  const windDifference = best.wind - currentWind;
  const tradeoffs = [];

  if (temperatureDifference <= -2) tradeoffs.push("cooler than now");
  if (temperatureDifference >= 2) tradeoffs.push("warmer than now");
  if (windDifference >= 1.5) {
    tradeoffs.push(`winds pick up to ${getWindSpeed(best.item.wind.speed, units)}`);
  } else if (windDifference <= -1.5) {
    tradeoffs.push("winds ease compared with now");
  }
  if (best.rainChance >= 25) tradeoffs.push(`rain chance is ${best.rainChance}%`);

  return {
    ...best,
    quality: best.score >= 70 ? "Good conditions" : best.score >= 45 ? "Fair conditions" : "Best available",
    tradeoff: tradeoffs.length > 0
      ? tradeoffs.join("; ")
      : "This is the best balance of temperature, rain chance, and wind in the forecast",
  };
}

function getSevereAlerts(weather, units) {
  if (!weather) return [];

  const entries = [
    { ...weather.current, city: weather.current.name, isCurrent: true },
    ...weather.forecast.list.slice(0, 8).map((item) => ({
      ...item,
      city: weather.current.name,
    })),
  ];
  const alerts = new Map();
  const tempToCelsius = (value) => units === "metric" ? value : (value - 32) * 5 / 9;
  const windToMetersPerSecond = (value) => units === "metric" ? value : value * 0.44704;

  entries.forEach((entry) => {
    const condition = entry.weather[0];
    const time = entry.isCurrent
      ? "Now"
      : formatCityTime(entry.dt, weather.current.timezone, { hour: "numeric" });
    const addAlert = (key, title, detail) => {
      if (!alerts.has(key)) alerts.set(key, { key, title, detail, time, city: entry.city });
    };

    if (condition.id >= 200 && condition.id < 300) {
      addAlert("thunderstorm", "Thunderstorm", "Thunderstorms are expected.");
    }
    if ((entry.rain?.["3h"] ?? 0) >= 7.5) {
      addAlert("heavy-rain", "Heavy rain", "Heavy rainfall is expected.");
    }
    if ((entry.snow?.["3h"] ?? 0) >= 2.5) {
      addAlert("heavy-snow", "Heavy snow", "Heavy snowfall is expected.");
    }
    if (windToMetersPerSecond(entry.wind.speed) >= 15) {
      addAlert("high-wind", "High winds", "Strong winds may make travel difficult.");
    }
    const temperature = tempToCelsius(entry.main.temp);
    if (temperature >= 38) {
      addAlert("extreme-heat", "Extreme heat", "Very high temperatures are expected.");
    }
    if (temperature <= -10) {
      addAlert("extreme-cold", "Extreme cold", "Very low temperatures are expected.");
    }
  });

  return [...alerts.values()];
}

function WeatherIcon({ code, description, className = "" }) {
  return (
    <img
      className={`weather-icon ${className}`}
      src={`https://openweathermap.org/img/wn/${code}@2x.png`}
      alt={description}
    />
  );
}

function App() {
  const [search, setSearch] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [units, setUnits] = useState("metric");
  const [weather, setWeather] = useState(null);
  const [comparisons, setComparisons] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [error, setError] = useState("");
  const [comparisonError, setComparisonError] = useState("");
  const [suggestionError, setSuggestionError] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const notifiedAlerts = useRef(new Set());

  const alerts = useMemo(
    () => [
      ...getSevereAlerts(weather, units),
      ...comparisons.flatMap((city) => getSevereAlerts(city, units)),
    ],
    [weather, comparisons, units],
  );
  const outdoorWindow = weather ? getBestOutdoorWindow(weather, units) : null;

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || !API_KEY || selectedLocation) {
      setSuggestions([]);
      setSuggestionError("");
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/geo/1.0/direct`, {
          params: { q: query, limit: 5, appid: API_KEY },
          signal: controller.signal,
        });
        setSuggestions(data);
        setSuggestionError("");
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setSuggestionError("City suggestions are unavailable right now.");
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, selectedLocation]);

  useEffect(() => {
    if (!notificationsEnabled || !("Notification" in window)) return;
    alerts.forEach((alert) => {
      const key = `${alert.city}:${alert.key}`;
      if (notifiedAlerts.current.has(key)) return;
      notifiedAlerts.current.add(key);
      new Notification(`${alert.title} · ${alert.city}`, {
        body: alert.detail,
        tag: key,
      });
    });
  }, [alerts, notificationsEnabled]);

  const loadWeather = async (location) => {
    if (!API_KEY) {
      setError(getErrorMessage({}));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    setSuggestions([]);
    try {
      const result = await getWeather(location, units);
      setWeather(result);
      setSearch(result.current.name);
      setSelectedLocation({
        lat: result.current.coord.lat,
        lon: result.current.coord.lon,
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (event) => {
    event.preventDefault();
    const query = search.trim();
    if (query) loadWeather(selectedLocation ?? query);
  };

  const handleLocation = () => {
    if (!navigator.geolocation) {
      setError("Location access isn't supported by this browser.");
      return;
    }
    setLoading(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => loadWeather({ lat: coords.latitude, lon: coords.longitude }),
      (locationError) => {
        setLoading(false);
        setError(
          locationError.code === locationError.PERMISSION_DENIED
            ? "Location permission was denied. Search for a city instead."
            : "Couldn't determine your location. Check your browser settings and try again.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const addComparison = async () => {
    const query = search.trim();
    if (!query) {
      setComparisonError("Search for a city before adding it to comparison.");
      return;
    }
    if (comparisons.length >= MAX_COMPARISONS) {
      setComparisonError(`You can compare up to ${MAX_COMPARISONS} cities.`);
      return;
    }
    if (weather?.current.name.toLowerCase() === query.toLowerCase()
      || comparisons.some((city) => city.current.name.toLowerCase() === query.toLowerCase())) {
      setComparisonError("That city is already on the dashboard.");
      return;
    }
    setComparisonLoading(true);
    setComparisonError("");
    try {
      const result = await getWeather(selectedLocation ?? query, units);
      if (comparisons.some((city) => city.current.id === result.current.id)
        || weather?.current.id === result.current.id) {
        setComparisonError("That city is already on the dashboard.");
      } else {
        setComparisons((current) => [...current, result]);
      }
    } catch (requestError) {
      setComparisonError(getErrorMessage(requestError));
    } finally {
      setComparisonLoading(false);
    }
  };

  const removeComparison = (cityId) => {
    setComparisons((current) => current.filter((city) => city.current.id !== cityId));
  };

  const changeUnits = async () => {
    const nextUnits = units === "metric" ? "imperial" : "metric";
    if (!weather) {
      setUnits(nextUnits);
      return;
    }

    setLoading(true);
    setError("");
    setComparisonError("");
    const [mainResult, ...comparisonResults] = await Promise.allSettled([
      getWeather(weather.location, nextUnits),
      ...comparisons.map((city) => getWeather(city.location, nextUnits)),
    ]);
    const allSucceeded = mainResult.status === "fulfilled"
      && comparisonResults.every((result) => result.status === "fulfilled");
    if (allSucceeded) {
      setWeather(mainResult.value);
      setComparisons(comparisonResults.map((result) => result.value));
      setUnits(nextUnits);
    } else if (mainResult.status === "rejected") {
      setError(getErrorMessage(mainResult.reason));
    } else {
      setComparisonError("Some comparison data couldn't be refreshed for the new units.");
    }
    setLoading(false);
  };

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      setError("This browser doesn't support weather notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
    } else {
      setError(permission === "denied"
        ? "Notifications are blocked in browser settings."
        : "Allow notifications to receive severe-weather alerts.");
    }
  };

  const chooseSuggestion = (suggestion) => {
    const label = [suggestion.name, suggestion.state, suggestion.country]
      .filter(Boolean)
      .join(", ");
    setSearch(label);
    setSelectedLocation({ lat: suggestion.lat, lon: suggestion.lon });
    setSuggestions([]);
    setSuggestionError("");
  };

  const renderCityCard = (city, isComparison = false) => {
    const current = city.current;
    return (
      <article className={`weather-card ${isComparison ? "comparison-card" : "primary-card"}`} key={current.id}>
        {isComparison && (
          <button
            className="remove-city"
            type="button"
            onClick={() => removeComparison(current.id)}
            aria-label={`Remove ${current.name} from comparison`}
          >
            <FaTimes />
          </button>
        )}
        <div className="city-heading">
          <div>
            <p className="eyebrow">{isComparison ? "COMPARISON" : "CURRENT WEATHER"}</p>
            <h2>{current.name}{current.sys?.country ? `, ${current.sys.country}` : ""}</h2>
          </div>
          <WeatherIcon
            code={current.weather[0].icon}
            description={current.weather[0].description}
          />
        </div>
        <div className="temperature-row">
          <p className="temperature">{getTemperature(current.main.temp, units)}</p>
          <p className="condition">{current.weather[0].description}</p>
        </div>
        <p className="feels-like">Feels like {getTemperature(current.main.feels_like, units)}</p>
        <div className="weather-metrics">
          <div className="metric">
            <WiHumidity aria-hidden="true" />
            <div><strong>{current.main.humidity}%</strong><span>Humidity</span></div>
          </div>
          <div className="metric">
            <WiStrongWind aria-hidden="true" />
            <div><strong>{getWindSpeed(current.wind.speed, units)}</strong><span>Wind</span></div>
          </div>
        </div>
        {!isComparison && (
          <div className="sun-times">
            <span>Sunrise <strong>{formatCityTime(current.sys.sunrise, current.timezone, { hour: "numeric", minute: "2-digit" })}</strong></span>
            <span>Sunset <strong>{formatCityTime(current.sys.sunset, current.timezone, { hour: "numeric", minute: "2-digit" })}</strong></span>
          </div>
        )}
      </article>
    );
  };

  return (
    <main className="app-shell">
      <div className="dashboard">
        <header className="topbar">
          <a className="brand" href="/" aria-label="Weatherly home">
            <span className="brand-mark">W</span>
            <span>Weatherly</span>
          </a>
          <div className="topbar-actions">
            <button
              className="utility-button"
              type="button"
              onClick={enableNotifications}
              disabled={notificationsEnabled}
              title={notificationsEnabled ? "Severe weather notifications enabled" : "Enable severe weather notifications"}
            >
              <FaBell aria-hidden="true" />
              <span>{notificationsEnabled ? "Alerts on" : "Enable alerts"}</span>
            </button>
            <button
              className="unit-toggle"
              type="button"
              onClick={changeUnits}
              disabled={loading || comparisonLoading}
              aria-label={`Switch to ${units === "metric" ? "Fahrenheit" : "Celsius"}`}
            >
              <span className={units === "metric" ? "unit-active" : ""}>°C</span>
              <span className="unit-divider">/</span>
              <span className={units === "imperial" ? "unit-active" : ""}>°F</span>
            </button>
          </div>
        </header>

        <section className="intro">
          <p className="eyebrow">YOUR WEATHER, AT A GLANCE</p>
          <h1>Plan your day around the weather.</h1>
          <p className="intro-copy">Live conditions, forecasts, and alerts for the places you care about.</p>
        </section>

        <section className="search-panel" aria-label="Find a city">
          <form className="search-form" onSubmit={handleSearch}>
            <FaSearch className="search-icon" aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder="Search a city..."
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedLocation(null);
              }}
              aria-label="Search a city"
              aria-autocomplete="list"
              aria-controls="city-suggestions"
            />
            <button className="location-button" type="button" onClick={handleLocation} disabled={loading}>
              <FaMapMarkerAlt aria-hidden="true" />
              <span>Use my location</span>
            </button>
            <button className="search-submit" type="submit" disabled={loading || !search.trim()}>
              {loading ? "Loading..." : "Get weather"}
            </button>
            {suggestions.length > 0 && (
              <ul className="suggestions" id="city-suggestions" role="listbox">
                {suggestions.map((suggestion) => (
                  <li key={`${suggestion.lat}-${suggestion.lon}`}>
                    <button
                      type="button"
                      role="option"
                      onClick={() => chooseSuggestion(suggestion)}
                    >
                      <span>{suggestion.name}</span>
                      <small>{[suggestion.state, suggestion.country].filter(Boolean).join(", ")}</small>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
          {suggestionError && <p className="subtle-message">{suggestionError}</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="compare-controls">
            <span>{comparisons.length}/{MAX_COMPARISONS} comparison cities</span>
            <button
              className="text-button"
              type="button"
              onClick={addComparison}
              disabled={comparisonLoading}
            >
              {comparisonLoading ? "Adding..." : "+ Compare this city"}
            </button>
          </div>
          {comparisonError && <p className="error-message" role="alert">{comparisonError}</p>}
        </section>

        {alerts.length > 0 && (
          <section className="alerts-panel" aria-live="polite" aria-label="Severe weather alerts">
            <div className="alerts-heading">
              <div>
                <p className="eyebrow">WEATHER WATCH</p>
                <h2>Severe conditions ahead</h2>
              </div>
              <FaBell aria-hidden="true" />
            </div>
            <div className="alert-list">
              {alerts.map((alert) => (
                <div className="alert-item" key={`${alert.city}-${alert.key}`}>
                  <strong>{alert.title}</strong>
                  <span>{alert.city} · {alert.time} — {alert.detail}</span>
                </div>
              ))}
            </div>
            <p className="alert-disclaimer">Forecast-based heads-up, not an official emergency alert.</p>
          </section>
        )}

        {weather ? (
          <>
            <section aria-label="Current weather">{renderCityCard(weather)}</section>
            {comparisons.length > 0 && (
              <section className="comparison-section" aria-label="City comparison">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">SIDE BY SIDE</p>
                    <h2>Compare cities</h2>
                  </div>
                </div>
                <div className="comparison-grid">
                  {comparisons.map((city) => renderCityCard(city, true))}
                </div>
              </section>
            )}

            <section className="forecast-section" aria-label="3-hour forecast">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">UP NEXT</p>
                  <h2>3-hour forecast</h2>
                </div>
                <span>Next 24 hours</span>
              </div>
              <div className="hourly-list">
                {weather.forecast.list.slice(0, 8).map((item) => (
                  <article className="hourly-item" key={item.dt}>
                    <span>{formatCityTime(item.dt, weather.current.timezone, { hour: "numeric" })}</span>
                    <WeatherIcon code={item.weather[0].icon} description={item.weather[0].description} />
                    <strong>{getTemperature(item.main.temp, units)}</strong>
                    <small>{Math.round(item.pop * 100)}% rain</small>
                  </article>
                ))}
              </div>
            </section>

            {outdoorWindow && (
              <section className="outdoor-planner" aria-label="Recommended outdoor weather window">
                <div className="planner-heading">
                  <div>
                    <p className="eyebrow">PLAN AHEAD</p>
                    <h2>Best outdoor window</h2>
                  </div>
                  <span className={`planner-rating ${outdoorWindow.score < 45 ? "rating-limited" : ""}`}>
                    {outdoorWindow.quality}
                  </span>
                </div>
                <p className="planner-time">
                  {formatCityTime(outdoorWindow.start, weather.current.timezone, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {" – "}
                  {formatCityTime(outdoorWindow.end, weather.current.timezone, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <p className="planner-description">
                  The 3-hour period with the best overall balance in the next 24 hours.
                </p>
                <div className="planner-factors">
                  {outdoorWindow.reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
                <p className="planner-tradeoff">
                  <strong>Tradeoff:</strong> {outdoorWindow.tradeoff}.
                </p>
                <p className="planner-disclaimer">
                  A general outdoor-planning estimate based on forecast temperature, wind, and precipitation—not a safety advisory.
                </p>
              </section>
            )}

            <section className="forecast-section daily-section" aria-label="Five day forecast">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">THE WEEK AHEAD</p>
                  <h2>5-day forecast</h2>
                </div>
              </div>
              <div className="daily-list">
                {getDailyForecast(weather.forecast).map((day) => (
                  <article className="daily-item" key={day.date}>
                    <span>{new Intl.DateTimeFormat(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${day.date}T12:00:00Z`))}</span>
                    <div className="daily-condition">
                      <WeatherIcon code={day.icon.icon} description={day.icon.description} />
                      <small>{day.icon.description}</small>
                    </div>
                    <strong>{getTemperature(day.max, units)} <span>/ {getTemperature(day.min, units)}</span></strong>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="empty-state">
            <span className="empty-icon">☀</span>
            <h2>Find your forecast</h2>
            <p>Search for a city or use your location to see the weather.</p>
          </section>
        )}

        <footer>
          <span>Weather data by OpenWeather</span>
          {weather && <span>Updated for {weather.current.name}</span>}
        </footer>
      </div>
    </main>
  );
}

export default App;
