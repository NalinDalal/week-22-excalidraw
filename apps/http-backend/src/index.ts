import express from "express";
import jwt from "jsonwebtoken";

const app = express();

app.post("/signin", (req, res) => {});
app.post("signup", (req, res) => {});
app.post("/room", (req, res) => {});
app.listen(3001);
