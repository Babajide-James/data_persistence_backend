"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const database_1 = require("./database");
const profileRoutes_1 = __importDefault(require("./routes/profileRoutes"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// To enforce the specific header as per requirements without relying entirely on generic cors setup
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});
app.use(express_1.default.json());
// Routes
app.use('/api/profiles', profileRoutes_1.default);
// Catch all for 404
app.use((req, res) => {
    res.status(404).json({ status: 'error', message: 'Not Found' });
});
const PORT = process.env.PORT || 3000;
// Initialize app only after DB ensures it's readable
(0, database_1.getDb)().then(() => {
    app.listen(PORT, () => {
        console.log(`Server starting on port ${PORT}`);
    });
}).catch(err => {
    console.error("Failed to start server due to DB error:", err);
});
