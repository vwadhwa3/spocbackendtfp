// ENV FIRST
require("dotenv").config();

const express = require("express");
const app = express();

const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const winston = require("winston");
const client = require("prom-client");

// ✅ Initialize Database FIRST before routes
const { db } = require("./config/dataBase");

// Initialize DB connection before loading routes
db()
    .then(() => {
        console.log("Database connection established, SPOCTFPBACKEND");

        // Start Express Server after DB connects
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error("Database connection failed:", err.message);
        process.exit(1);
    });

/* ===================== LOGGER (WINSTON) ===================== */

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
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

/* ===================== RATE LIMIT (ONLY ITINERARY) ===================== */

const itineraryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});

/* ===================== REQUEST METRICS MIDDLEWARE ===================== */

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();

  res.on("finish", () => {
    end({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status: res.statusCode,
    });

    httpRequestCounter.inc({
      method: req.method,
      route: req.route ? req.route.path : req.path,
      status: res.statusCode,
    });

    logger.info({
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ip: req.ip,
    });
  });

  next();
});

// Routes
const authRoutes = require("./src/routes/authRoutes");
const depositRoutes = require("./src/routes/depositRoutes");
const visaCategory = require("./src/routes/visaCategory"); //visa category
const visaHistoryRoutes = require("./routes/visaHistoryRoutes"); //visa history routes
const travelInfoRoutes = require("./routes/travelInfoRoutes")

// Travel Info, Document Type, Document Category
const documentType = require("./routes/documentType.routes");
const documentCategory = require("./routes/documentCategory.routes");

// ADMIN ROUTES
const appStatus = require("./routes/Admin/appStatus.routes");
const enumMasterRetry = require("./routes/Admin/enumMaster.routes");
const maritialStatus = require("./routes/Admin/maritalStatus.routes");
const bContact = require("./routes/Admin/bContact.routes");
const bApplication = require("./routes/Admin/b_application.routes");
const user = require("./routes/Admin/user.routes");
const taskTypeRoutes = require("./routes/Admin/taskType.routes");
const sTask = require("./routes/Admin/sTask.routes");
const task = require("./routes/Admin/task.routes");

// CSR ROUTES
const prepareDocumentsRoutes = require("./routes/CSR/prepareDocuments.routes");
const CSRstatus = require("./routes/CSR/applicationStatus.routes");

// TEAM LEAD ROUTES
const appStatusTL = require("./routes/TeamLead/applicationStatus.Routes");
const applicationReviewRoutes = require("./routes/TeamLead/applicationReview.routes");

// SYSTEM ROUTES
const safeToDispatchRoute = require("./routes/System/safeToDispatch.route");
const documentUploadRoute = require("./routes/System/documentUpload.route");

app.use("/api/auth", authRoutes);
app.use("/api", depositRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
});
app.use("/visa-category", visaCategory);
app.use("/visa-history", visaHistoryRoutes);
app.use("/travel-info", travelInfoRoutes); //travel info routes
app.use("/document-type", documentType); // document type routes
app.use("/document-category", documentCategory); // document category routes

// ADMIN APPLICATION STATUS INITIALIZATION
app.use("/api/v1/application-status", appStatus);

// ADMIN APPLICATION STATUS INITIALIZATION
app.use("/api/v1/application-status", appStatus);
app.use("/api/v1/enum-master", enumMasterRetry);
app.use("/api/v1/marital-status", maritialStatus);
app.use("/api/v1/bContact", bContact);
app.use("/api/v1/applications", bApplication);
app.use("/api/v1/users", user);
app.use("/api/v1/task-types", taskTypeRoutes);
app.use("/api/v1/sTask", sTask);
app.use("/api/v1/task", task);

// CSR ROUTES
app.use("/api/v2/prepare-documents", prepareDocumentsRoutes);
app.use("/api/v2/status-update", CSRstatus);

// TEAM LEAD ROUTES
app.use("/api/v3/status-update", appStatusTL);
app.use("/api/v3/application-review", applicationReviewRoutes);

// SYSTEM ROUTES
app.use("/api/v4/system", safeToDispatchRoute);
app.use("/api/v4/system/document", documentUploadRoute); //FOR TESTING PURPOSE ONLY so that can test the above route

/* ===================== PROTECTED METRICS ===================== */

app.get("/metrics", async (req, res) => {
  if (req.headers["x-metrics-key"] !== process.env.METRICS_SECRET) {
    return res.status(403).send("Forbidden");
  }

  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

module.exports = app;