const sql = require("mssql/msnodesqlv8");

const databaseConfig = {
  server: "LAPTOP-HHBF77NF\\SQLEXPRESS",
  database: "RaceManagement",
  driver: "msnodesqlv8",
  options: {
    trustedConnection: true,
    trustServerCertificate: true
  }
};

const poolPromise = new sql.ConnectionPool(databaseConfig)
  .connect()
  .then((pool) => {
    console.log("✅ SQL Server connected");
    return pool;
  })
  .catch((error) => {
    console.error("❌ SQL Server connection error:", error);
    throw error;
  });

module.exports = {
  sql,
  poolPromise
};
