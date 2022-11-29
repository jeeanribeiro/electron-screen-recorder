import { ipcRenderer } from "electron"

let mediaRecorder;
const recordedChunks = []

async function capturerInit() {
    try {
      const constraints = {
        video: {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        },
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
          }
        }
      }
  
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      handleStream(stream)
    } catch (e) {
      try {
        const constraints = {
          video: {
            mandatory: {
              chromeMediaSource: 'desktop'
            }
          },
        }
  
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        handleStream(stream)
      } catch (err) {
        handleError(err)
      }
      handleError(e)
    }
}

function capturerStart() {
  mediaRecorder.start()
}

function capturerStop() {
  mediaRecorder.stop()
}

function handleDataAvailable(e) {
  console.log('video data available');
  recordedChunks.push(e.data);
}

async function handleStop(e) {
  const blob = new Blob(recordedChunks, {
    type: 'video/webm; codecs=vp9'
  });

  const buffer = Buffer.from(await blob.arrayBuffer());

  ipcRenderer.invoke('save-video', buffer);
}

function handleStream (stream) {
  const options = { mimeType: 'video/webm; codecs=vp9' };
  mediaRecorder = new MediaRecorder(stream, options);
  
  // Register Event Handlers
  mediaRecorder.ondataavailable = handleDataAvailable;
  mediaRecorder.onstop = handleStop;
}

function handleError (e) {
  console.log(e)
}

window.electronAPI = {
  hello: 'hello world',
  initCapture: () => capturerInit(),
  startCapture: () => capturerStart(),
  stopCapture: () => capturerStop(),
}
