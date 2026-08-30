RACE TIMING PRO - FULL DEMO SOURCE (FIXED)
==========================================

1. DATABASE
-----------
- Open SQL Server Management Studio.
- Select/open RaceManagement.
- Run: database/upgrade.sql
- The script creates/updates the demo operations accounts and the additional tables.

2. BACKEND
----------
cd backend
npm install
npm run dev

Expected:
- SQL Server connected
- Race Timing Pro API: http://localhost:3000
- Demo admin accounts are ready

3. FRONTEND
-----------
Open another terminal:
cd frontend
npm install
npm run dev

Open the Local URL printed by Vite (normally 5173; if busy it may be 5174).

4. MAIN PAGES
-------------
/                Athlete registration
/athlete         Athlete/BIB lookup
/results         Official result lookup
/complaint       Athlete complaint
/admin/login     Operations login
/admin           Operations dashboard

5. LOGIN NOTE
-------------
The login screen intentionally does NOT show any account/password hints.
This project is a local internship/demo system. Demo accounts are provisioned
by database/upgrade.sql and synchronized when the backend starts.

6. FIXES IN THIS BUILD
----------------------
- Removed the unprofessional hero copy/flow text highlighted in the review.
- Fixed Chrome autofill white backgrounds on athlete registration fields.
- Removed dot/bullet separators from the result waiting card.
- Removed visible demo credentials from the login page.
- Login fields are empty by default and display a clean invalid-login message.
- Backend synchronizes local demo login accounts at startup.
- backend/src/app.js is expanded/readable instead of compressed into one-line code.
