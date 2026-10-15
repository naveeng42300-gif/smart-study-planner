
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo").default;
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const client = new MongoClient(process.env.MONGODB_URI);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let tasks;
let users;
app.set("trust proxy", 1);
app.use(session({
    name: "studyPlanner.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        dbName: "smart_study_planner",
        collectionName: "sessions"
    }),
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24
    }
}));

function requireLogin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Please log in first" });
    }
    next();
}

// Register
app.post("/api/register", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (
            typeof username !== "string" ||
            !username.trim() ||
            typeof password !== "string" ||
            password.length < 6
        ) {
            return res.status(400).json({
                error: "Enter a username and a password of at least 6 characters"
            });
        }

        const name = username.trim();
        const existing = await users.findOne({ username: name });

        if (existing) {
            return res.status(409).json({ error: "Username already exists" });
        }

        await users.insertOne({
            username: name,
            password: await bcrypt.hash(password, 10),
            createdAt: new Date()
        });

        res.status(201).json({ message: "Registration successful" });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "Username already exists" });
        }
        console.error(error);
        res.status(500).json({ error: "Registration failed" });
    }
});

// Login
app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (typeof username !== "string" || typeof password !== "string") {
            return res.status(400).json({ error: "Enter username and password" });
        }

        const user = await users.findOne({ username: username.trim() });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        req.session.regenerate((error) => {
            if (error) {
                return res.status(500).json({ error: "Could not start session" });
            }

            req.session.userId = user._id.toString();
            req.session.username = user.username;

            req.session.save((saveError) => {
                if (saveError) {
                    return res.status(500).json({ error: "Could not save session" });
                }

                res.json({
                    message: "Login successful",
                    username: user.username
                });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login failed" });
    }
});

// Check current session
app.get("/api/me", (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: "Not logged in" });
    }

    res.json({ username: req.session.username });
});

// Logout
app.post("/api/logout", (req, res, next) => {
    req.session.destroy((error) => {
        if (error) return next(error);

        res.clearCookie("studyPlanner.sid", {
            httpOnly: true,
            sameSite: "lax",
            secure: false
        });

        res.json({ message: "Logged out successfully" });
    });
});

// Get this user's tasks
app.get("/api/tasks", requireLogin, async (req, res) => {
    try {
        const data = await tasks
            .find({ userId: req.session.userId })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Could not load tasks" });
    }
});

// Add a task
app.post("/api/tasks", requireLogin, async (req, res) => {
    try {
        const { subject, topic, date } = req.body;

        if (
            typeof subject !== "string" || !subject.trim() ||
            typeof topic !== "string" || !topic.trim() ||
            typeof date !== "string" || !date.trim()
        ) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const task = {
            userId: req.session.userId,
            subject: subject.trim(),
            topic: topic.trim(),
            date,
            completed: false,
            createdAt: new Date()
        };

        const result = await tasks.insertOne(task);
        res.status(201).json({ ...task, _id: result.insertedId });
    } catch (error) {
        res.status(500).json({ error: "Could not save task" });
    }
});

// Complete or undo a task belonging to this user
app.patch("/api/tasks/:id", requireLogin, async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id) ||
            typeof req.body.completed !== "boolean") {
            return res.status(400).json({ error: "Invalid task ID or request" });
        }

        const result = await tasks.updateOne(
            {
                _id: new ObjectId(req.params.id),
                userId: req.session.userId
            },
            { $set: { completed: req.body.completed } }
        );

        if (!result.matchedCount) {
            return res.status(404).json({ error: "Task not found" });
        }

        res.json({ message: "Task updated" });
    } catch (error) {
        res.status(500).json({ error: "Could not update task" });
    }
});

// Delete a task belonging to this user
app.delete("/api/tasks/:id", requireLogin, async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: "Invalid task ID" });
        }

        const result = await tasks.deleteOne({
            _id: new ObjectId(req.params.id),
            userId: req.session.userId
        });

        if (!result.deletedCount) {
            return res.status(404).json({ error: "Task not found" });
        }

        res.json({ message: "Task deleted" });
    } catch (error) {
        res.status(500).json({ error: "Could not delete task" });
    }
});

async function startServer() {
    try {
        if (!process.env.SESSION_SECRET) {
            throw new Error("SESSION_SECRET is missing from .env");
        }

        await client.connect();

        const db = client.db("smart_study_planner");
        tasks = db.collection("tasks");
        users = db.collection("users");

        await users.createIndex({ username: 1 }, { unique: true });

        app.listen(PORT, () => {
            console.log(`Smart Study Planner: http://localhost:${PORT}`);
            console.log("MongoDB connected successfully!");
        });
    } catch (error) {
        console.error("Startup failed:", error.message);
    }
}

startServer();
