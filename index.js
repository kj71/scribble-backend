const { Server } = require('socket.io');
const { SOCKET_RECEIVED_EVENTS, SOCKET_SENT_EVENTS, USER_STATUS } = require('./constants');
const Queue = require('./queue');

const io = new Server(8080, {
  cors: {
    origin: "http://localhost:3000"
  }
});

const roomQueue = new Queue();
const userQueue = new Queue();
const userStatus = {};

function assignRoomToUser() {
  if(userQueue.isEmpty()) {
    return;
  }
  const currentUser = userQueue.getCurrentData();
  userQueue.dequeue();
  if (userStatus[currentUser] === USER_STATUS.DISCONNECTED) {
    delete userStatus[currentUser];
    return;
  }
  userStatus[currentUser] = USER_STATUS.JOINING;
  if(roomQueue.isEmpty()) {
    // TODO: Create new Room in DB.
    // TODO: Add new Room in Queue.
  } else {
    // TODO: If room is now full, dequeue from roomQueue.
  }
  const currentRoom = roomQueue.getCurrentData();
  socket.join(currentRoom);
  userStatus[currentUser] = USER_STATUS.JOINED;
};


function disconnectUser(currentUser) {
  if(userStatus[currentUser] === USER_STATUS.JOINING) {
    setTimeout(() => {
      disconnectUser(currentUser);
    }, 1000);
  } else if (userStatus[currentUser] === USER_STATUS.JOINED) {
    // TODO: Delete from DB.
    // TODO: If room is available, add in roomQueue.
    delete userStatus[currentUser];
  } else {
    userStatus[currentUser] = USER_STATUS.DISCONNECTED;
  }
}

setInterval(assignRoomToUser, 1000);

io.on("connection", (socket) => {
  const currentUser = socket.id;
  // socket.join("ROOM1");
  // socket.on(SOCKET_RECEIVED_EVENTS.CHAT_MESSAGE_TO_SERVER, (chatMessageText) => {
  //   io.to("ROOM1").emit(SOCKET_SENT_EVENTS.CHAT_MESSAGE_FROM_SERVER, {
  //     chatMessageText,
  //     senderName: currentUser,
  //   });
  // });
  userQueue.enqueue(currentUser);
  socket.on("disconnect", (reason) => {
    disconnectUser(currentUser)
  });
});


