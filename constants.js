const SOCKET_RECEIVED_EVENTS = {
  CHAT_MESSAGE_TO_SERVER: 'chat-message-to-server',
};

const SOCKET_SENT_EVENTS = {
  CHAT_MESSAGE_FROM_SERVER: 'chat-message-to-clients',
};

const ROOM_SIZE = 2;

const USER_STATUS = {
  JOINED: 1,
  JOINING: 2,
  DISCONNECTED: 3,
}

module.exports = {
  SOCKET_RECEIVED_EVENTS,
  SOCKET_SENT_EVENTS,
  ROOM_SIZE,
  USER_STATUS
}