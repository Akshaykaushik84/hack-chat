// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 100 * 1024 * 1024 // 100 MB
});

const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const activeTransfers = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('joinRoom', ({ room, userName }) => {
    socket.join(room);
    socket.to(room).emit('message', { 
      user: 'GHOST💀', 
      text: `${userName} has joined the room.` 
    });
  });

  socket.on('chatMessage', ({ room, userName, message }) => {
    io.to(room).emit('message', { user: userName, text: message });
  });

  socket.on('start-file-transfer', ({ room, userName, fileName, fileSize, fileType }) => {
    if (fileSize > MAX_FILE_SIZE) {
      return socket.emit('file-transfer-error', 'File size exceeds 100 MB limit');
    }

    const fileId = `${socket.id}-${Date.now()}`;
    activeTransfers.set(fileId, {
      room,
      userName,
      fileName,
      fileSize,
      fileType,
      chunks: [],
      startTime: Date.now()
    });

    socket.emit('file-transfer-ready', { fileId });
  });

  socket.on('file-chunk', ({ fileId, chunk, chunkIndex, isLastChunk }) => {
    const transfer = activeTransfers.get(fileId);
    if (!transfer) {
      return socket.emit('file-transfer-error', 'Invalid file transfer');
    }

    try {
      transfer.chunks.push(chunk);

      if (isLastChunk) {
        const fileContent = Buffer.concat(transfer.chunks);
        const transferTime = Date.now() - transfer.startTime;

        io.to(transfer.room).emit('fileMessage', {
          user: transfer.userName,
          fileName: transfer.fileName,
          fileSize: transfer.fileSize,
          fileType: transfer.fileType,
          fileContent: fileContent.toString('base64'),
          transferTime
        });

        activeTransfers.delete(fileId);
      }

      socket.emit('chunk-received', { fileId, chunkIndex });
    } catch (error) {
      console.error('Chunk error:', error);
      socket.emit('file-transfer-error', 'Chunk processing failed');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
