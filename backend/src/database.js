require("dotenv").config();

const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  charset: "utf8mb4",

  // Giữ MySQL DATE ở dạng YYYY-MM-DD.
  // Tránh DateOfBirth bị lệch 1 ngày do timezone của JavaScript.
  dateStrings: ["DATE"]
});

async function testDatabaseConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.ping();

    console.log("✅ MySQL connected successfully");
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  testDatabaseConnection
};