// FrontEnd(or Browser)

// Connect to the server that uses SocketIO.
const socket = io();

// Get DOM
const welcomeDOM = document.getElementById("welcome");
const welcomeForm = welcomeDOM.querySelector("form");
const roomList = welcomeDOM.querySelector("#roomList");
const roomNameInput = welcomeForm.querySelector("#roomName");
const topNickname = welcomeForm.querySelector("#topNickname");
const createBtn = welcomeForm.querySelector(".create");
const searchJoinBtn = welcomeForm.querySelector(".searchJoin");

const streamWrapper = document.getElementById('streamWrapper');
const myStreamDOM = document.getElementById('myStream');
const peerStream = document.getElementById('peerStream');
const muteBtn = document.getElementById('sound');
const cameraBtn = document.getElementById('camera');
const camerasSelect = document.getElementById('cameras');
const messageList = document.getElementById('messageList');
const messageForm = document.getElementById('messageForm');
const roomNicknameInput = messageForm.querySelector('#roomNickname');
const messageInput = messageForm.querySelector("#message")
const leaveBtn = streamWrapper.querySelector(".leave");

const nicknameInputs = [topNickname, roomNicknameInput];

// Lower the volume, for the hearing protection.
myStreamDOM.volume = 0.2;


// Get Media Devices (Camera, Audio)
let myStream;
let isMute = false;
let isCameraOff = false;
async function getMedia(deviceId){
  try {
    // Arg. of getUserMedia() : Types of streams you want to get, specify as an object.
    myStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: deviceId ? {deviceId: {exact: deviceId}} : {facingMode: "user"},
    });
    myStreamDOM.srcObject = myStream;
    if (!deviceId) await getCameras();
  } catch (error) {
    console.log(error);
    document.getElementById('error').textContent = 'Your browser / device does not support navigator.mediaDevices.\n Or you have not allowed the browser to access to camera & mic.';
  }
}

// Variables related to rooms.
let roomName;
let nickname;
let doubleClickPrevent;

// Variable related to P2P
let myPeerConnection;
let myDataChannel;

// Event Handlers
createBtn.addEventListener("click", handleRoomCreation);
leaveBtn.addEventListener("click", leaveRoom);
muteBtn.addEventListener('click', handleMuteBtn);
cameraBtn.addEventListener('click', handleCameraBtn);
camerasSelect.addEventListener('change', handleCameraChange);
messageForm.addEventListener('submit', handleSendingMessage);
searchJoinBtn.addEventListener("click", handleSearchedRoomJoin);
nicknameInputs.forEach((el) => {
  el.addEventListener("input", syncNickname);
});

// Handle events from the server.
// The logic for Peer A, the creator of the room, or the old members dwelling in the room.
socket.on("greeting", async (payload, participants) => {
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("open", (event) => console.log("Peer A : Data channel is opened!"));
  myDataChannel.addEventListener("message", (event) => {
    const chatObj = JSON.parse(event.data);
    addMessage(chatObj);
  });

  const offer = await myPeerConnection.createOffer(); // https://huchu.link/1vcRLgS
  myPeerConnection.setLocalDescription(offer); // https://huchu.link/ryOuwR4
  console.log("🏠 Peer A: The offer has been sent to the server.");
  socket.emit("offer", offer, roomName);
  updateUsersCount(participants);
  echoJoinMsg(payload.message);
});
socket.on("answer", (answer) => {
  console.log("🏠 Peer A: Got the answer from the server.");
  myPeerConnection.setRemoteDescription(answer);
});
// The logic for Peer B, the new participant of the room.
socket.on("offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (event) => {
    myDataChannel = event.channel;
    myDataChannel.addEventListener("open", () => console.log("Peer B : Data channel is opened!"));
    myDataChannel.addEventListener("message", (event) => {
      const chatObj = JSON.parse(event.data);
      addMessage(chatObj);
    });
  });
  console.log("🙋‍♂️🙋‍♀️ Peer B: Got the offer from the server.");
  myPeerConnection.setRemoteDescription(offer); // https://huchu.link/uIobtS0
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  console.log("🙋‍♂️🙋‍♀️ Peer B: Sent answer to the server.");
  socket.emit("answer", answer, roomName);
});
// The logic for peer A, initially.
// The logic is for Peer A and Peer B
socket.on("ice", (icecandidate) => {
  console.log('Received icecandidate from the server.');
  if(myPeerConnection) {
    myPeerConnection.addIceCandidate(icecandidate); // https://huchu.link/5vJyTCU
  }
});
socket.on("farewell", async (payload, participants) => {
  // Make new connection ready for the the next guest.
  peerStream.srcObject = null;
  await initiateStream();

  updateUsersCount(participants);
  echoJoinMsg(payload.message);
});
socket.on("leave", async (payload, participants) => {
  // Make new connection ready for the the next guest.
  peerStream.srcObject = null; // Remove Peer B's video screen.
  await initiateStream();

  updateUsersCount(participants);
  echoJoinMsg(payload.message);
});
socket.on("roomUpdate", (rooms) => {
  const subtitle = welcomeDOM.querySelector("h4");
  subtitle.innerText = `※ Available rooms: ${rooms.length}`;
  roomList.textContent = null;

  rooms.forEach((publicRoom) => {
    updateRooms(publicRoom);
  });
});
socket.on("roomNotFound", (roomName) => {
  const errorMsg = `${roomName} does not exist.`;
  showErrorMsg(errorMsg);
});
socket.on("roomExist", (roomName) => {
  const errorMsg = `The room name, ${roomName}, already exists.`;
  showErrorMsg(errorMsg);
});
socket.on("roomFull", (roomName) => {
  const errorMsg = `The room name, ${roomName} is full.`;
  showErrorMsg(errorMsg);
});

// Event listener functions
function handleMuteBtn(event) {
  isMute = !isMute;
  toggleMic();
  isMute ? event.target.classList.add('muted') : event.target.removeAttribute('class');
}
function handleCameraBtn(event) {
  isCameraOff = !isCameraOff;
  toggleCamera();
  isCameraOff ? event.target.classList.add('off') : event.target.removeAttribute('class');
}
async function handleCameraChange() {
  await getMedia(camerasSelect.value);

  if(myPeerConnection) {
    // When my camera changes, send my updated video track to my peers.
    const myVideoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection.getSenders().find((sender) => sender.track.kind === 'video');
    videoSender.replaceTrack(myVideoTrack);
  }

  // Sync mic mute & camera on setting.
  toggleMic(); 
  toggleCamera(); 
}
function handleSendingMessage(event) {
  event.preventDefault();
  const validatePassed = validateForm('room');
  if(!validatePassed) return false;

  const msg = messageInput.value.trim();
  const chatObj = {nickname: roomNicknameInput.value, message: msg};
  const chatJSON = JSON.stringify({nickname: roomNicknameInput.value, message: msg});
  if(myDataChannel.readyState === "open") myDataChannel.send(chatJSON);
  addMessage(chatObj, true);
  messageInput.value = "";
}
async function handleRoomCreation() {
  preventFastClicks();
  if(doubleClickPrevent) return;
  doubleClickPrevent = true;

  const validatePassed = validateForm('welcome');
  if(!validatePassed) return false;

  await initiateStream();
  const payload = {nickname: topNickname.value, room_name: roomNameInput.value};
  socket.emit("createRoom", payload, showRoom);
  roomName = roomNameInput.value;
}
async function handleSearchedRoomJoin() {
  const validatePassed = validateForm('welcome');
  if(!validatePassed) return false;

  // Check if the selected room is full, 2 people.
  roomName = roomNameInput.value;
  const isRoomFull = checkRoomLimit();
  if(isRoomFull) {
    const errorMsg = `The room name, ${roomName} is full.`;
    showErrorMsg(errorMsg);
    return;
  }

  // Check if the room exist
  const isRoomExist = checkRoomExist();
  if(!isRoomExist) {
    const errorMsg = `${roomName} does not exist.`;
    showErrorMsg(errorMsg);
    return;
  }

  await initiateStream();
  socket.emit("joinRoom", {nickname: topNickname.value, room_name: roomNameInput.value}, showRoom);
}
function handleJoinFromRoomList(event) {
  const currentListRoomName = event.target.nextElementSibling.innerText;
  roomNameInput.value = currentListRoomName;
  handleSearchedRoomJoin();
}

// Custom functions
function toggleMic() {
  myStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMute;
  });
}
function toggleCamera() {
  myStream.getVideoTracks().forEach((track) => {
    track.enabled = !isCameraOff;
  });
}
async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === 'videoinput');
    const currentCamera = myStream.getVideoTracks(); // For selecting the camera currently used at initial stage.
    // Dynamically create camera options.
    cameras.forEach((camera) => {
      const option = document.createElement('option');
      option.value = camera.deviceId;
      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      camerasSelect.append(option);
    });
  } catch (error) {
    console.log(error);
  }
}
async function initiateStream() {
  await getMedia();
  makeConnection(); // RTC code.
}
function addMessage(payload, writtenByMe) {
  const timeStampDOM = createTimestamp();
  const messageLine = document.createElement("li");
  let msg = `${payload.nickname}: ${payload.message}`;
  if(writtenByMe){
    msg = `(You)`.concat(' ', msg);
    messageLine.classList.add("mine");
  }
  messageLine.innerText = msg;
  messageLine.append(timeStampDOM);
  messageList.appendChild(messageLine);
  scrollDownMessageList();
}
function createTimestamp() {
  const timeLine = document.createElement('small');
  const date = new Date();
  const hours =  date.getHours();
  const minutes = date.getMinutes();
  timeLine.innerText = `    ${hours < 10 ? `0${hours}` : hours}:${minutes < 10 ? `0${minutes}` : minutes}`;
  return timeLine;
}
function updateRooms(publicRoom) {
  const roomLine = document.createElement("li");
  const roomNameSpan = document.createElement("span");
  const participantsSpan = document.createElement("span");
  const roomJoinBtn = document.createElement("button");

  roomNameSpan.classList.add("roomName");
  roomNameSpan.innerText = publicRoom.roomName;
  participantsSpan.innerText = `[${publicRoom.participants}/2]`;
  roomJoinBtn.setAttribute('value', publicRoom.participants);

  if (publicRoom.participants < 2) {
    roomJoinBtn.classList.add("roomJoin");
    roomJoinBtn.innerText = "Join";
    roomJoinBtn.addEventListener('click', handleJoinFromRoomList);
  } else {
    roomJoinBtn.innerText = "Full";
    roomJoinBtn.classList.add("roomFull");
  }

  roomLine.append(roomJoinBtn);
  roomLine.append(roomNameSpan);
  roomLine.append(participantsSpan);
  roomList.appendChild(roomLine);
}
function updateUsersCount(participants) {
  streamWrapper.querySelector("h3").innerHTML = `Room : ${roomName} ( ${participants} / 2 )`;
}
function showErrorMsg(message) {
  const errorMsgDOM = welcomeDOM.querySelector('.notFound');
  if(errorMsgDOM) {
    errorMsgDOM.remove();
  };
  const errorMsg = document.createElement("p");
  errorMsg.innerText = message;
  errorMsg.classList.add('notFound');

  const roomBtnWrapper = document.querySelector('.roomBtnWrapper');
  roomBtnWrapper.before(errorMsg);
}
function validateForm(type) {
  let validationPassed = true;
  switch(type){
    case 'welcome':
      const isTopNicknameEmpty = topNickname.value.trim().length === 0;
      const isRoomNameEmpty = roomNameInput.value.trim().length === 0;
      if ( isTopNicknameEmpty || isRoomNameEmpty) {
        const topErrMsg = 'Please fill in nickname & room name.';
        showErrorMsg(topErrMsg);
        validationPassed = false;
      }
      break;
    case 'room':
      const isRoomNicknameEmpty = roomNicknameInput.value.trim().length === 0;
      const isChatEmpty = messageInput.value.trim().length === 0;
      if ( isRoomNicknameEmpty || isChatEmpty) {
        const roomErrMsg = 'Please fill in nickname & chat message.';
        showErrorMsg(roomErrMsg);
        validationPassed = false;
      }
      break;
    default:
      break;
  }
  return validationPassed;
}
async function showRoom(participants) {
  // Hide welcome div.
  welcomeDOM.removeAttribute("class");
  roomNameInput.value = "";
  const errorMsgDOM = welcomeDOM.querySelector('.notFound');
  if(errorMsgDOM) {
    errorMsgDOM.remove();
  }
  // Visualize hidden room
  streamWrapper.classList.add("active");
  const roomH3 = streamWrapper.querySelector("h3");
  roomH3.innerHTML = roomName.trim().length !== 0 ? `Room : ${roomName} ( ${participants} / 2 )` : 'Room'

  // Update number of participants & show an initial message.
  if(participants) {
    const message = `【SYSTEM】 You've joined the room.`
    echoJoinMsg(message);
  }
}
function echoJoinMsg(msg) {
  const timeStampDOM = createTimestamp();
  const messageLine = document.createElement("li");
  messageLine.innerText = msg;
  messageLine.append(timeStampDOM);
  messageList.appendChild(messageLine);
  scrollDownMessageList();
}
function leaveRoom() {
  // Visualize hidden room
  streamWrapper.removeAttribute("class");

  // Show welcome div.
  welcomeDOM.classList.add("active");

  const roomH3 = streamWrapper.querySelector("h3");
  roomH3.innerHTML = 'Room';
  messageList.textContent = null;

  // Remove tracks from the stream.
  myStream.getTracks().forEach((track) => {
    track.stop(); // https://huchu.link/l2Bfwax
  });
  myPeerConnection.close();
  myStream = null;
  myPeerConnection = null;


  socket.emit("leave", roomName, nickname);
}
function syncNickname(event) {
  const updatedNickname = event.target.value;
  nicknameInputs.forEach((el) => {
    el.value = updatedNickname;
    nickname = updatedNickname;
  });
}
function scrollDownMessageList() {
  messageList.lastElementChild.scrollIntoView();
}
function checkRoomLimit() {
  let isFull;
  roomList.querySelectorAll('.roomName').forEach((room) => {
    if(room.innerText === roomName) {
      isFull = parseInt(room.previousElementSibling.value) > 1;
    }
  });
  return isFull;
}
function checkRoomExist() {
  let exist;
  roomList.querySelectorAll('.roomName').forEach((room) => {
    if(room.innerText === roomName) {
      exist = true;
    }
  });
  return exist;
}
function preventFastClicks() {
  clearTimeout(this.preventClickTimer);
  this.preventClickTimer = setTimeout(()=>{
    doubleClickPrevent = false;
  }, 300);
}

// RTC Connection.
function makeConnection() {
  // Make P2P Connection (Peer A and Peer B)
  myPeerConnection = new RTCPeerConnection({
    iceServers : [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  }); // https://huchu.link/3AChPBY
  myPeerConnection.addEventListener('icecandidate', handleICE);
  myPeerConnection.addEventListener('track', handleAddStream);
  myStream.getTracks().forEach((track) => {
    myPeerConnection.addTrack(track, myStream); // https://huchu.link/r3S7Wcd
  });
}
function handleICE(data) {
  // ICEcandidate is invoked whenever there is communication between peers.
  console.log('Sent candidate to the server.');
  socket.emit('ice', data.candidate, roomName);
}
function handleAddStream(data) {
  // Attach 'Mediastream' of peer B to the video tag.
  peerStream.srcObject = data.streams[0]; // https://huchu.link/CYisHDJ
}