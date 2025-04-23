require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const path = require("path")
const app = express();


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    cors({
        origin: "http://127.0.0.1:5173",
        methods: "GET, POST, PUT, DELETE, OPTIONS",
        allowedHeaders: "*",
    })
);

app.use(
    helmet({
        crossOriginResourcePolicy: false,
    })
);
app.use(morgan('dev'));

connectDB();
app.use(express.static(path.join(__dirname, "public")))
// Routes
const authRoutes = require('./routes/auth')
const profileRoutes = require("./routes/profile")
app.use("/api/auth", authRoutes)
app.use("/api/profile", profileRoutes)


app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
    console.log('Received kill signal, shutting down gracefully');

    server.close(async () => {
        console.log('Closed out remaining connections');
        try {
            await mongoose.connection.close(false);
            console.log('MongoDB connection closed');
            process.exit(0);
        } catch (err) {
            console.error('Error closing MongoDB connection:', err);
            process.exit(1);
        }
    });

    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}



