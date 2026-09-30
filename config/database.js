//never change this file
const admin = require("firebase-admin");
require("dotenv").config();
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

let firestore = null;
let realtimeDB = null;
let supabase = null;
let pgPool = null;

const db = async () => {
  // ✅ Initialize Firebase
  try {
    if (!admin.apps.length) {
      const rawServiceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT,
      );
      rawServiceAccount.private_key = rawServiceAccount.private_key.replace(
        /\\n/g,
        "\n",
      );

      admin.initializeApp({
        credential: admin.credential.cert(rawServiceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });

      firestore = admin.firestore();
      realtimeDB = admin.database();
      console.log("✅ Firebase initialized.");
    }
  } catch (firebaseError) {
    console.error("❌ Firebase initialization failed:", firebaseError);
  }

  // ✅ Initialize Supabase JS Client
  try {
    if (!supabase) {
      supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      );
      console.log("✅ Supabase JS client initialized.");
    }
  } catch (supabaseError) {
    console.error("❌ Supabase client failed:", supabaseError);
  }

  // ✅ Initialize PostgreSQL Pool (raw SQL)
  console.log("🔍 PG Config:", {
    host: process.env.SUPABASE_DB_HOST,
    password: process.env.SUPABASE_DB_PASSWORD ? "✅ loaded" : "❌ missing",
  });
  try {
    if (!pgPool) {
      pgPool = new Pool({
        host: process.env.SUPABASE_DB_HOST,
        port: parseInt(process.env.SUPABASE_DB_PORT) || 6543,
        database: "postgres",
        user: process.env.SUPABASE_DB_USER,
        password: process.env.SUPABASE_DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      const testClient = await pgPool.connect();
      const result = await testClient.query("SELECT NOW() AS current_time;");
      testClient.release();
      console.log(
        "✅ PostgreSQL connected. Server time:",
        result.rows[0].current_time,
      );
    }
  } catch (pgError) {
    console.error(
      "❌ PostgreSQL connection failed:",
      pgError.message,
      pgError.code,
    );
    pgPool = null;
  }

  return { firestore, realtimeDB, supabase, pgPool };
};

// ✅ Direct getter — use this in routes instead of calling db() again
const getPool = () => pgPool;
const getSupabase = () => supabase;
const getFirestore = () => firestore;
const getRealtimeDB = () => realtimeDB;

module.exports = { db, getPool, getSupabase, getFirestore, getRealtimeDB };

// const admin = require('firebase-admin');
// require('dotenv').config();
// //const { Pool } = require('pg');
// const { createClient } = require('@supabase/supabase-js');

// let firestore = null;
// let realtimeDB = null;
// let supabase = null;

// const db = async () => {
//   // ✅ Initialize Firebase
//   try {
//     if (!admin.apps.length) {
//       const rawServiceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
//       rawServiceAccount.private_key = rawServiceAccount.private_key.replace(/\\n/g, '\n');

//       admin.initializeApp({
//         credential: admin.credential.cert(rawServiceAccount),
//         databaseURL: process.env.FIREBASE_DATABASE_URL,
//       });

//       firestore = admin.firestore();
//       realtimeDB = admin.database();

//       console.log("✅ Firebase initialized.");
//     }
//   } catch (firebaseError) {
//     console.error("❌ Firebase initialization failed:", firebaseError);
//   }

//   // ✅ Initialize PostgreSQL (Supabase)
//   try {

//         supabase = createClient(
//         process.env.SUPABASE_URL,
//         process.env.SUPABASE_SERVICE_ROLE_KEY // Needs service role for full access
//       );
//       // const { rows } = await pgPool.query('SELECT NOW()');
//       console.log("PostgreSQL (Supabase) connected.");

//   } catch (pgError) {
//     console.error("❌ PostgreSQL connection failed:", pgError);
//   }

//   // Return the initialized services
//   return {
//     firestore,
//     realtimeDB,
//     supabase,
//   };
// };

// module.exports = {db};
