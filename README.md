# e_card_rtc

A mind-reading card game.

Built with ...

* **Frontend**: HTML, CSS, JS, PUG
* **Backend**: SocketIO, Node.js, STUN ICEServers (for dev-only)
* **API**: MediaDevices, RTCPeerConnection, ICECandidate,

## WIP
🛠 The link to the prototype: https://ihdi3.sse.codesandbox.io/


⚠️ Confronted difficulties.

1. Understanding the process of the WebRTC, and how to implement it.
<br>📝 Need to know detail about the WebRTC.
<br>Sam Dutton's Resource: https://www.html5rocks.com/en/tutorials/webrtc/basics/
<br>MDN's Resource: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Protocols

2. When the peer or the host leaves the room they were in, resetting the stream and RTCPeerConnection for both.
<br>This is mandatory for accepting and streaming a new peer that participates the existing room.

3. Less knowledge of making my own STUN server. (WIP)
<br>📝 Need to find and learn the requisites for building STUN server with cloud services.


