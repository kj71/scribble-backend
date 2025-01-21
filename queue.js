class Node {
  constructor () {
    this.data = data;
    this.next = null;
  }
};

class Queue {
  constructor() {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }
  enqueue(data) {
    const newNode = new Node(data);
    if (this.head === null) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      this.tail.next = newNode;
      this.tail = newNode;
    }
    this.length += 1;
  }
  dequeue() {
    if (this.length > 0) {
      this.head = this.head.next;
      this.length -= 1;
    }
  }
  getCurrentData() {
    if(this.length > 0) {
      return this.head.data;
    }
    return null;
  }
  isEmpty() {
    return this.length == 0;
  }
  getLength(){
    return this.length;
  }
};

module.exports = Queue;