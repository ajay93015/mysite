const express = require('express');

const ejs = require('ejs');
const bodyParser = require('body-parser');

const fs = require("fs");
const { exec } = require("child_process");
const http = require("http");
const socketIo = require("socket.io");
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.json());
//const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/views/index.html');
});

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('offer', (data) => {
        socket.broadcast.emit('offer', data);
    });

    socket.on('answer', (data) => {
        socket.broadcast.emit('answer', data);
    });

    socket.on('candidate', (data) => {
        socket.broadcast.emit('candidate', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
   // console.log(`Server is running on http://localhost:${PORT}`);
});
