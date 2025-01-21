const { Server } = require('socket.io');
const { SOCKET_RECEIVED_EVENTS, SOCKET_SENT_EVENTS } = require('./constants');
const Queue = require('./queue');

const io = new Server(8080, {
  cors: {
    origin: "http://localhost:3000"
  }
});

const roomQueue = new Queue();
const userQueue = new Queue();

const assignRoomToUser = () => {
  if(userQueue.isEmpty()) {
    return;
  }
  if(roomQueue.isEmpty()) {
    // TODO
  } else {
    const currentRoom = roomQueue.getCurrentData();
    socket.join(currentRoom);
    //TODO
  }
};

setInterval(assignRoomToUser, 1000);

io.on("connection", (socket) => {
  // socket.join("ROOM1");
  // socket.on(SOCKET_RECEIVED_EVENTS.CHAT_MESSAGE_TO_SERVER, (chatMessageText) => {
  //   io.to("ROOM1").emit(SOCKET_SENT_EVENTS.CHAT_MESSAGE_FROM_SERVER, {
  //     chatMessageText,
  //     senderName: socket.id,
  //   });
  // });
  userQueue.enqueue(socket.id);
  socket.on("disconnect", (reason) => {
    console.log(reason, "KOKO");
  })
});


