let video = document.getElementById('webcam');
let canvas = document.getElementById('output');
let ctx = canvas.getContext('2d', { willReadFrequently: true });
let prevFrame = null;
let referenceFrame = null;

// FPS tracking
let frameCount = 0;
let lastTime = performance.now();

// Capture reference frame button
document.getElementById('captureBtn').addEventListener('click', function() {
  if (referenceFrame == null) {
    referenceFrame = prevFrame;
    console.log("Reference frame captured!");
    this.innerText = "Reference Frame Captured ✅ (Click to reset)";
  } else {
    referenceFrame = null;
    this.innerText = "Capture Reference Frame";
    console.log("Reference frame cleared!");
  }
});

function onOpenCvReady() {
  console.log("OpenCV Ready!");
  startWebcam();
}

function startWebcam() {
  navigator.mediaDevices.getUserMedia({ video: true })
    .then(function(stream) {
      video.srcObject = stream;
      console.log("Webcam working!");
      setTimeout(captureFrames, 1000);
    })
    .catch(function(error) {
      console.log("Webcam error: " + error);
    });
}

function captureFrames() {
  setInterval(function() {
    ctx.drawImage(video, 0, 0, 640, 480);
    let currentFrame = ctx.getImageData(0, 0, 640, 480);

    // Use reference frame if captured, otherwise use previous frame
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
        0.5, 3, 15, 3, 5, 1.2, 0
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
  }, 100);
}

function updateFPS() {
  frameCount++;
  let now = performance.now();
  let elapsed = now - lastTime;

  // Update FPS every second
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