let intervalId = null;
let camWidth = 640;
let camHeight = 480;
let levels = 3;
let windowSize = 15;
let video = document.getElementById('webcam');
let showOriginal = false;
let canvas = document.getElementById('output');
let ctx = canvas.getContext('2d', { willReadFrequently: true });
let prevFrame = null;
let referenceFrame = null;

let frameCount = 0;
let lastTime = performance.now();

document.getElementById('captureBtn').addEventListener('click', function() {
  if (referenceFrame == null) {
    referenceFrame = prevFrame;
    this.innerText = "Reference Frame Captured ✅ (Click to reset)";
  } else {
    referenceFrame = null;
    this.innerText = "Capture Reference Frame";
  }
});

document.getElementById('viewToggleBtn').addEventListener('click', function() {
  showOriginal = !showOriginal;
  
  if (showOriginal) {
    video.style.display = 'block';
    canvas.style.display = 'none';
    this.innerText = '🔄 Show BOS Feed';
  } else {
    video.style.display = 'none';
    canvas.style.display = 'block';
    this.innerText = '🔄 Show Original Feed';
  }
});

let isPaused = false;

let currentCamera = 'user'; // user = front, environment = back

document.getElementById('switchBtn').addEventListener('click', function() {
  if (currentCamera === 'user') {
    currentCamera = 'environment';
    this.innerText = '🤳 Switch to Front Camera';
  } else {
    currentCamera = 'user';
    this.innerText = '📷 Switch to Back Camera';
  }
  prevFrame = null;
  referenceFrame = null;
  startWebcam();
});

let flashOn = false;

document.getElementById('flashBtn').addEventListener('click', async function() {
  let track = video.srcObject && video.srcObject.getVideoTracks()[0];
  
  if (!track) {
    alert('Camera not available!');
    return;
  }

  let capabilities = track.getCapabilities();
  
  if (!capabilities.torch) {
    alert('Flash not supported on this device/camera!');
    return;
  }

  flashOn = !flashOn;

  await track.applyConstraints({
    advanced: [{ torch: flashOn }]
  });

  this.innerText = flashOn ? '🔦 Flash ON' : '🔦 Flash OFF';
});

document.getElementById('pauseBtn').addEventListener('click', function() {
  if (!isPaused) {
    // Stop interval
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    // Camera stopped — resource free
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
    }
    isPaused = true;
    this.innerText = "▶️ Resume Feed";
  } else {
    // Camera wapas shuru karo
    isPaused = false;
    this.innerText = "⏸️ Pause Feed";
    startWebcam();
  }
});

document.getElementById('levelsSlider').addEventListener('input', function() {
  levels = parseInt(this.value);
  document.getElementById('levelsVal').innerText = this.value;
});

document.getElementById('windowSlider').addEventListener('input', function() {
  windowSize = parseInt(this.value);
  document.getElementById('windowVal').innerText = this.value;
});

document.getElementById('resSelect').addEventListener('change', function() {
  let parts = this.value.split('x');
  camWidth = parseInt(parts[0]);
  camHeight = parseInt(parts[1]);
  document.getElementById('resVal').innerText = this.value;
  canvas.width = camWidth;
  canvas.height = camHeight;
  prevFrame = null;
  referenceFrame = null;
  document.getElementById('captureBtn').innerText = "Capture Reference Frame";
  startWebcam();
});

document.getElementById('processBtn').addEventListener('click', function() {
  let refFile = document.getElementById('refImage').files[0];
  let flowFile = document.getElementById('flowImage').files[0];

  if (!refFile || !flowFile) {
    alert('Please select both images!');
    return;
  }

  // Size check — 2MB limit
  if (refFile.size > 2 * 1024 * 1024 || flowFile.size > 2 * 1024 * 1024) {
    alert('Warning: Image size is over 2MB. This may slow down processing or crash on mobile.');
  }

  let img1 = new Image();
  let img2 = new Image();

  img1.onload = function() {
    img2.onload = function() {

      // Resolution check
      if (img1.width !== img2.width || img1.height !== img2.height) {
        alert('Warning: Both images have different resolutions!\nImage 1: ' + img1.width + 'x' + img1.height + '\nImage 2: ' + img2.width + 'x' + img2.height + '\nResults may be incorrect!');
      }

      canvas.width = img1.width;
      canvas.height = img1.height;

      ctx.drawImage(img1, 0, 0);
      let frame1 = ctx.getImageData(0, 0, img1.width, img1.height);

      ctx.drawImage(img2, 0, 0);
      let frame2 = ctx.getImageData(0, 0, img2.width, img2.height);

      let mat1 = cv.matFromImageData(frame1);
      let mat2 = cv.matFromImageData(frame2);

      let gray1 = new cv.Mat();
      let gray2 = new cv.Mat();
      cv.cvtColor(mat1, gray1, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(mat2, gray2, cv.COLOR_RGBA2GRAY);

      let flow = new cv.Mat();
      cv.calcOpticalFlowFarneback(
        gray1, gray2, flow,
        0.5, levels, windowSize, 3, 5, 1.2, 0
      );

      visualizeFlow(flow);
      document.getElementById('downloadBtn').style.display = 'inline-block';

      // Freeze live feed
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      document.getElementById('resumeBtn').style.display = 'inline-block';

      mat1.delete(); mat2.delete();
      gray1.delete(); gray2.delete();
      flow.delete();
    };
    img2.src = URL.createObjectURL(flowFile);
  };
  img1.src = URL.createObjectURL(refFile);
});

document.getElementById('downloadBtn').addEventListener('click', function() {
  let link = document.createElement('a');
  link.download = 'optical_flow_result.png';
  link.href = canvas.toDataURL();
  link.click();
});

document.getElementById('resumeBtn').addEventListener('click', function() {
  document.getElementById('resumeBtn').style.display = 'none';
  document.getElementById('downloadBtn').style.display = 'none';
  captureFrames();
});

let burstImg1 = null;
let burstImg2 = null;

document.getElementById('burstBtn').addEventListener('click', function() {
  this.innerText = "Capturing...";
  this.disabled = true;

  let tempCanvas = document.createElement('canvas');
  tempCanvas.width = camWidth;
  tempCanvas.height = camHeight;
  let tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(video, 0, 0, camWidth, camHeight);
  burstImg1 = tempCanvas.toDataURL('image/png');

  setTimeout(function() {
    tempCtx.drawImage(video, 0, 0, camWidth, camHeight);
    burstImg2 = tempCanvas.toDataURL('image/png');

    let img1 = new Image();
    let img2 = new Image();

    img1.onload = function() {
      img2.onload = function() {
        canvas.width = camWidth;
        canvas.height = camHeight;

        ctx.drawImage(img1, 0, 0);
        let frame1 = ctx.getImageData(0, 0, camWidth, camHeight);

        ctx.drawImage(img2, 0, 0);
        let frame2 = ctx.getImageData(0, 0, camWidth, camHeight);

        let mat1 = cv.matFromImageData(frame1);
        let mat2 = cv.matFromImageData(frame2);

        let gray1 = new cv.Mat();
        let gray2 = new cv.Mat();
        cv.cvtColor(mat1, gray1, cv.COLOR_RGBA2GRAY);
        cv.cvtColor(mat2, gray2, cv.COLOR_RGBA2GRAY);

        let flow = new cv.Mat();
        cv.calcOpticalFlowFarneback(
          gray1, gray2, flow,
          0.5, levels, windowSize, 3, 5, 1.2, 0
        );

        visualizeFlow(flow);

        document.getElementById('burstDownloads').style.display = 'flex';
        document.getElementById('burstBtn').innerText = "📸 Capture Burst";
        document.getElementById('burstBtn').disabled = false;

        mat1.delete(); mat2.delete();
        gray1.delete(); gray2.delete();
        flow.delete();
      };
      img2.src = burstImg2;
    };
    img1.src = burstImg1;
  }, 0);
});

document.getElementById('downloadImg1').addEventListener('click', function() {
  let link = document.createElement('a');
  link.download = 'burst_image1.png';
  link.href = burstImg1;
  link.click();
});

document.getElementById('downloadImg2').addEventListener('click', function() {
  let link = document.createElement('a');
  link.download = 'burst_image2.png';
  link.href = burstImg2;
  link.click();
});

document.getElementById('downloadFlow').addEventListener('click', function() {
  let link = document.createElement('a');
  link.download = 'burst_flow_result.png';
  link.href = canvas.toDataURL();
  link.click();
});

let mediaRecorder = null;
let recordedChunks = [];
let recordingTimer = null;
let recordingSeconds = 0;

document.getElementById('recordBtn').addEventListener('click', function() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // Stop recording
    mediaRecorder.stop();
    clearInterval(recordingTimer);
    this.innerText = '🔴 Start Recording';
    document.getElementById('recordTimer').innerText = '00:00';
  } else {
    // Warning if high resolution
    if (camWidth > 320) {
      alert('Warning: High resolution may cause lag or crash during recording. Recommended: 320x240 or lower.');
    }

    // Start recording canvas
    recordedChunks = [];
    recordingSeconds = 0;
    document.getElementById('downloadRecordBtn').style.display = 'none';

    // ============================================
    // VIDEO RECORDING - Canvas Stream Capture
    // ============================================
    // 
    // IMPORTANT: captureStream() called WITHOUT a fixed FPS number
    // 
    // WHY: Originally used canvas.captureStream(10) to force 10 FPS recording.
    // PROBLEM: Live feed processing runs at variable rate (~18-20 FPS depending 
    // on device/resolution/parameters). When recording was forced to 10 FPS,
    // there was a mismatch between actual canvas update rate and recording rate.
    // This caused corrupted video metadata (e.g., FPS showing as 1000, frame 
    // count showing as 40,000+ for a 10 second recording).
    //
    // FIX: Removed the fixed number. captureStream() now follows the canvas's
    // natural update rate (whatever visualizeFlow() actually achieves).
    // This keeps recording in sync with live feed — no more metadata corruption.
    //
    // If recording quality/smoothness issues come up again, check this first
    // before changing back to a fixed FPS value.
    // ============================================

    let stream = canvas.captureStream();
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm'
    });

    mediaRecorder.ondataavailable = function(e) {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = function() {
      let blob = new Blob(recordedChunks, { type: 'video/webm' });
      let url = URL.createObjectURL(blob);
      let downloadBtn = document.getElementById('downloadRecordBtn');
      downloadBtn.style.display = 'inline-block';
      downloadBtn.onclick = function() {
        let link = document.createElement('a');
        link.download = 'bos_flow_recording.webm';
        link.href = url;
        link.click();
      };
    };

    mediaRecorder.start();
    this.innerText = '⏹️ Stop Recording';

    // Timer + 30 sec auto stop
    recordingTimer = setInterval(function() {
      recordingSeconds++;
      let mins = Math.floor(recordingSeconds / 60).toString().padStart(2, '0');
      let secs = (recordingSeconds % 60).toString().padStart(2, '0');
      document.getElementById('recordTimer').innerText = mins + ':' + secs;

      // Auto stop at 30 seconds
      if (recordingSeconds >= 30) {
        mediaRecorder.stop();
        clearInterval(recordingTimer);
        document.getElementById('recordBtn').innerText = '🔴 Start Recording';
        document.getElementById('recordTimer').innerText = '00:00';
      }
    }, 1000);
  }
});

function onOpenCvReady() {
  console.log("OpenCV Ready!");
  startWebcam();
}

function startWebcam() {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
  }
  
  let constraints = {
    video: {
      facingMode: { exact: currentCamera },
      width: camWidth,
      height: camHeight
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
      video.srcObject = stream;
      console.log("Webcam working! Camera: " + currentCamera);
      setTimeout(captureFrames, 1000);
    })
    .catch(function(error) {
      console.log("Camera switch error: " + error);
      // Fallback — try without exact
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: currentCamera,
          width: camWidth,
          height: camHeight
        }
      })
      .then(function(stream) {
        video.srcObject = stream;
        console.log("Webcam working fallback!");
        setTimeout(captureFrames, 1000);
      })
      .catch(function(err) {
        console.log("Webcam error: " + err);
      });
    });
}

function captureFrames() {
  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(function() {
    ctx.drawImage(video, 0, 0, camWidth, camHeight);
    let currentFrame = ctx.getImageData(0, 0, camWidth, camHeight);

    let baseFrame = referenceFrame != null ? referenceFrame : prevFrame;

    if (baseFrame != null) {
      let prev = cv.matFromImageData(baseFrame);
      let curr = cv.matFromImageData(currentFrame);

      let prevGray = new cv.Mat();
      let currGray = new cv.Mat();
      cv.cvtColor(prev, prevGray, cv.COLOR_RGBA2GRAY);
      cv.cvtColor(curr, currGray, cv.COLOR_RGBA2GRAY);

      let flow = new cv.Mat();
      cv.calcOpticalFlowFarneback(
        prevGray, currGray, flow,
        0.5, levels, windowSize, 3, 5, 1.2, 0
      );

      visualizeFlow(flow);
      updateFPS();

      prev.delete();
      curr.delete();
      prevGray.delete();
      currGray.delete();
      flow.delete();
    }

    prevFrame = currentFrame;
  }, 50);
}

function updateFPS() {
  frameCount++;
  let now = performance.now();
  let elapsed = now - lastTime;
  if (elapsed >= 1000) {
    let fps = Math.round((frameCount * 1000) / elapsed);
    document.getElementById('fps').innerText = "FPS: " + fps;
    frameCount = 0;
    lastTime = now;
  }
}

function visualizeFlow(flow) {
  let flowChannels = new cv.MatVector();
  cv.split(flow, flowChannels);
  let flowX = flowChannels.get(0);
  let flowY = flowChannels.get(1);

  let magnitude = new cv.Mat();
  let angle = new cv.Mat();
  cv.cartToPolar(flowX, flowY, magnitude, angle, true);

  let magNorm = new cv.Mat();
  cv.normalize(magnitude, magNorm, 0, 255, cv.NORM_MINMAX);

  let hsv = new cv.Mat();
  let hsvChannels = new cv.MatVector();

  let hue = angle;
  let sat = new cv.Mat(flow.rows, flow.cols, cv.CV_32F, new cv.Scalar(255));
  let val = magNorm;

  hsvChannels.push_back(hue);
  hsvChannels.push_back(sat);
  hsvChannels.push_back(val);
  cv.merge(hsvChannels, hsv);

  let hsv8 = new cv.Mat();
  hsv.convertTo(hsv8, cv.CV_8U);
  let rgb = new cv.Mat();
  cv.cvtColor(hsv8, rgb, cv.COLOR_HSV2RGB);
  cv.imshow('output', rgb);

  flowX.delete(); flowY.delete();
  magnitude.delete(); angle.delete();
  magNorm.delete(); hsv.delete();
  hsv8.delete(); rgb.delete();
  sat.delete();
  hsvChannels.delete();
  flowChannels.delete();
}
