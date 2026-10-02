// Load env before anything reads process.env
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const winston = require("winston");
const client = require("prom-client");

const { db } = require("./config/database");

// Routes
const authRoutes = require("./routes/auth.routes");
const depositRoutes = require("./routes/deposit.routes");
const visaCategoryRoutes = require("./routes/visaCategory.routes");
const visaHistoryRoutes = require("./routes/visaHistory.routes");
const travelInfoRoutes = require("./routes/travelInfo.routes");
const documentTypeRoutes = require("./routes/documentType.routes");
const documentCategoryRoutes = require("./routes/documentCategory.routes");

// Admin routes
const appStatusRoutes = require("./routes/Admin/appStatus.routes");
const enumMasterRoutes = require("./routes/Admin/enumMaster.routes");
const maritalStatusRoutes = require("./routes/Admin/maritalStatus.routes");
const bContactRoutes = require("./routes/Admin/bContact.routes");
const bApplicationRoutes = require("./routes/Admin/bApplication.routes");
const userRoutes = require("./routes/Admin/user.routes");
const taskTypeRoutes = require("./routes/Admin/taskType.routes");
const sTaskRoutes = require("./routes/Admin/sTask.routes");
const taskRoutes = require("./routes/Admin/task.routes");

// CSR routes
const csrPrepareDocumentsRoutes = require("./routes/CSR/prepareDocuments.routes");
const csrApplicationStatusRoutes = require("./routes/CSR/applicationStatus.routes");

// Team Lead routes
const teamLeadApplicationStatusRoutes = require("./routes/TeamLead/applicationStatus.routes");
const teamLeadApplicationReviewRoutes = require("./routes/TeamLead/applicationReview.routes");

// System routes
const safeToDispatchRoutes = require("./routes/System/safeToDispatch.routes");
const documentUploadRoutes = require("./routes/System/documentUpload.routes");

const app = express();

/* ===================== LOGGER ===================== */

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

/* ===================== PROMETHEUS ===================== */

client.collectDefaultMetrics();

const httpRequestCounter = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
});

/* ===================== CORE SETTINGS ===================== */

app.set("trust proxy", 1);
app.use(express.json());

/* ===================== CORS ===================== */

const allowedOrigins = [
  "http://localhost:5173",
  "https://theflyingpanda.io",
  "https://theflyingpandatestingtfs.web.app",
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true, // lets the browser send the auth `token` cookie
  }),
);

/* ===================== HELMET ===================== */

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...allowedOrigins],
        styleSrc: ["'self'", "'unsafe-inline'", ...allowedOrigins],
        imgSrc: ["'self'", "data:", ...allowedOrigins],
        fontSrc: ["'self'", ...allowedOrigins],
        connectSrc: ["'self'", ...allowedOrigins],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    referrerPolicy: { policy: "no-referrer-when-downgrade" },
  }),
);

/* ===================== REQUEST METRICS ===================== */

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    const labels = {
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status: res.statusCode,
    };

    end(labels);
    httpRequestCounter.inc(labels);

    logger.info({
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ip: req.ip,
    });
  });

  next();
});

/* ===================== ROUTES ===================== */

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/metrics", async (req, res) => {
  if (req.headers["x-metrics-key"] !== process.env.METRICS_SECRET) {
    return res.status(403).send("Forbidden");
  }

  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.use("/api/auth", authRoutes);
app.use("/api", depositRoutes);

app.use("/visa-category", visaCategoryRoutes);
app.use("/visa-history", visaHistoryRoutes);
app.use("/travel-info", travelInfoRoutes);
app.use("/document-type", documentTypeRoutes);
app.use("/document-category", documentCategoryRoutes);

// Admin
app.use("/api/v1/application-status", appStatusRoutes);
app.use("/api/v1/enum-master", enumMasterRoutes);
app.use("/api/v1/marital-status", maritalStatusRoutes);
app.use("/api/v1/bContact", bContactRoutes);
app.use("/api/v1/applications", bApplicationRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/task-types", taskTypeRoutes);
app.use("/api/v1/sTask", sTaskRoutes);
app.use("/api/v1/task", taskRoutes);

// CSR
app.use("/api/v2/prepare-documents", csrPrepareDocumentsRoutes);
app.use("/api/v2/status-update", csrApplicationStatusRoutes);

// Team Lead
app.use("/api/v3/status-update", teamLeadApplicationStatusRoutes);
app.use("/api/v3/application-review", teamLeadApplicationReviewRoutes);

// System
app.use("/api/v4/system", safeToDispatchRoutes);
// Testing only: uploads a document so the safe-to-dispatch route can be exercised
app.use("/api/v4/system/document", documentUploadRoutes);

/* ===================== FALLBACK HANDLERS ===================== */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
});

/* ===================== STARTUP ===================== */

db()
  .then(() => {
    console.log("Database connection established, SPOCTFPBACKEND");

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  });

module.exports = app;
