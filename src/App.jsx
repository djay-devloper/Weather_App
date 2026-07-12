import React, { useState } from "react";
import { FaSearch } from "react-icons/fa";
import { WiHumidity } from "react-icons/wi";
import { WiStrongWind } from "react-icons/wi";

// in place of fetch api method
import axios from "axios";


function App() {

  // States to save data from API response.
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [temperature, setTemperature] = useState(null);
  const [humidity, setHumidity] = useState(null);
  const [windSpeed, setWindSpeed] = useState(null);
  const [cityName, setCityName] = useState("");
  const [weatherIcon, setWeatherIcon] = useState(null);

  const API_KEY = import.meta.env.VITE_API_KEY;

  const fetchWeather = async () => {
    console.log(search);

    // if no city given
    if (!search) return;
    setLoading(true);


    try {
      // To get weather data, you need to send an HTTP GET request to a specific URL (endpoint).
      const { data } = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${search}&units=metric&appid=${API_KEY}`
      );
      // to check the data in console
      console.log(data);

      setTemperature(data.main.temp);
      setHumidity(data.main.humidity);
      setWindSpeed(data.wind.speed);
      setCityName(data.name);
      setWeatherIcon(data.weather[0].icon);
      
    } catch (error) {
      console.log(error);
      setCityName("city not found");
      setTemperature(null);
      setHumidity(null);
      setWindSpeed(null);
      setWeatherIcon("01d");
    }
    setLoading(false);
  };

  // Trigger search on Enter key press
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      fetchWeather();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-950 to-black text-white">
      <h1 className="my-12 text-gray-200 font-semibold text-2xl">Weather App</h1>
      
      {/* Search bar & icon */}
      <div className="flex items-center bg-white rounded-full px-4 py-2 mb-6 w-80 shadow-lg">
        <input
          type="text"
          placeholder="Search for a city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown} 
          className="flex-1 text-black outline-none px-2"
        />
        <FaSearch
          onClick={fetchWeather}
          className="text-gray-500 cursor-pointer hover:text-gray-800 transition-colors"
        />
      </div>

      {/* Conditionally render weather icon only if we have data */}
      {weatherIcon && (
        <img
          src={`https://openweathermap.org/img/wn/${weatherIcon}@2x.png`}
          alt="Weather Condition Icon"
          className="w-20 h-20 mb-4"
        />
      )}

      {/* Temperature & CityName */}
      <h1 className="text-4xl font-bold mb-1">
        {loading
          ? "Loading..."
          : temperature !== null
          ? `${Math.round(temperature)}°C` 
          : "--"}
      </h1>
      <h2 className="text-2xl mt-2 font-semibold">
        {cityName || "Type to check temperature"}
      </h2>

      {/* Humidity & Wind Speed */}
      <div className="w-full max-w-md mt-7 flex flex-col md:flex-row items-center justify-between md:items-start">
        <div className="flex flex-col items-center">
          <WiHumidity className="text-4xl" />
          <span className="text-lg font-medium">
            {humidity !== null ? `${humidity}%` : "--"}
          </span>
          <p className="text-sm text-gray-300">Humidity</p>
        </div>
        
        <div className="flex flex-col items-center">
          <WiStrongWind className="text-4xl" />
          <span className="text-lg font-medium">
            {windSpeed !== null ? `${windSpeed} km/h` : "--"}
          </span>
          <p className="text-sm text-gray-300">Wind Speed</p>
        </div>
      </div>
    </div>
  );
}

export default App;