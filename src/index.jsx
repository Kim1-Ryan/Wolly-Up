import React from "react";
import ReactDOM from "react-dom/client"; // Added '/client'
import App from "./components/App";

// Created the root element container for React 18
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
