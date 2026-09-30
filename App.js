// ENV FIRST
require("dotenv").config();

const express = require("express");
const app = express();

// Database
const { db } = require("./config/database");

app.use(express.json());

// Start Database
db()
    .then(() => {
        console.log("Database connection established");

        // Start Express Server
        app.listen(process.env.PORT, () => {
            console.log(`Server running on port ${process.env.PORT}`);
        });
    })
    .catch((err) => {
        console.error("Database connection failed:", err.message);
    });