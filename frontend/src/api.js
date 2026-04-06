import axios from "axios";

// In development: uses REACT_APP_API_URL from .env (http://localhost:5000)
// In production: uses the Vercel-deployed backend URL
const BASE_URL = process.env.REACT_APP_API_URL || "";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});
