/*jshint esversion:6*/
var obs = new OBSWebSocket();
let GSTATE = "start"
let SCALE = 1.0
let POSITION = {x: 0, y: 0}

// CHANGE THE IP:PORT AND PASSWORD (OPTIONAL)
var address = "ws://172.16.0.123:4455"
var password = "xxx"

// ESTABLISH OBS SCENES AND SOURCES
let Scene_1 = 'webscene'
let Scene_2 = 'webscene2'
let Source_1 = 'lenny'
let Source_2 = 'video'

// SET UP ROBOFLOW.JS AUTH VARIABLES
let publishable_key = "xxx";
let model = "hand-gestures-fsph8";
let version = 5;

// TUNE ROBOFLOW.JS DETECTION VARIABLES (HIGHER THRESHOLD MEANS MORE ACCURATE)
let threshold = 0.5;
let overlap = 0.5;
let max_objects = 20;

// ESTABLISHES WEB SOCKET CONNECTION AND SETS SCENE TO 'WebcamScene'
obs.connect(address, password);
obs.call('SetCurrentProgramScene', {'sceneName': Scene_1});

// FUNCTION FOR SWITCHING TO SCENE 2
function webcam_scene() {
    obs.call('SetCurrentProgramScene', {'sceneName': Scene_1});
}

function webcam_scene_2() {
    obs.call('SetCurrentProgramScene', {'sceneName': Scene_2});
}

async function move_lenny(x ,y) {
    let ret = await obs.call('GetSceneItemId', {'sceneName': Scene_1, 'sourceName': Source_1})
    Source_1_ID = ret.sceneItemId;
    obs.call('SetSceneItemTransform', {'sceneName': Scene_1, 'sceneItemId': Source_1_ID, 'sceneItemTransform': {'positionX': x, 'positionY': y}});
}

async function getVideoSceneId() {
    const ret = await obs.call('GetSceneItemId', {'sceneName': Scene_1, 'sourceName': Source_2})
    return ret.sceneItemId;
}

async function start_video() {
    const sceneId = await getVideoSceneId()
    await obs.call('SetSceneItemEnabled', {
        'sceneItemId': sceneId,
        'sceneName': Scene_1,
        sceneItemEnabled: false
    })
    await obs.call('SetSceneItemEnabled', {
        'sceneItemId': sceneId,
        'sceneName': Scene_1,
        sceneItemEnabled: true
    })
}

async function stop_video() {
    const sceneId = await getVideoSceneId()
    await obs.call('SetSceneItemEnabled', {
        'sceneItemId': sceneId,
        'sceneName': Scene_1,
        sceneItemEnabled: false
    })
}

async function get_video_position() {
    const sceneId = await getVideoSceneId()
    return await obs.call('GetSceneItemTransform', {
        'sceneItemId': sceneId,
        'sceneName': Scene_1
    })
}

async function move_video(x ,y) {
    POSITION = {x, y}
    const sceneId = await getVideoSceneId()
    return await obs.call('SetSceneItemTransform', {
        sceneItemId: sceneId,
        sceneName: Scene_1,
        sceneItemTransform: {positionX: x, positionY: y}
    })
}

async function shift_video(x ,y) {
    POSITION = {
        x: POSITION.x + x, 
        y: POSITION.y + y
    }
    const sceneId = await getVideoSceneId()
    return await obs.call('SetSceneItemTransform', {
        sceneItemId: sceneId,
        sceneName: Scene_1,
        sceneItemTransform: {positionX: POSITION.x, positionY: POSITION.y}
    })
}

async function scale_video(inc) {
    SCALE += SCALE * inc
    const transform = {
        sourceHeight: parseInt(720 * SCALE), 
        sourceWidth: parseInt(1280 * SCALE)
    }
    const sceneId = await getVideoSceneId()
    return await obs.call('SetSceneItemTransform', {
        sceneItemId: sceneId,
        sceneName: Scene_1,
        sceneItemTransform: transform
    })
}


// obs.send('SetSceneItemTransform', { 'resource': 'NomeDaFonteDeCena', 'state': true });}).catch(err => {
//   // Houve um erro ao conectar ao OBS Studio
//   console.log(err);
// });


$(function () {
    const video = $("video")[0];

    var cameraMode = "environment"; // or "user"

    const startVideoStreamPromise = navigator.mediaDevices
        .getUserMedia({
            audio: false,
            video: {
                facingMode: cameraMode
            }
        })
        .then(function (stream) {

            // SWITCHES TO WEBCAM BEFORE STREAM INITILIZATION
            webcam_scene()

            return new Promise(function (resolve) {
                video.srcObject = stream;
                video.onloadeddata = function () {
                    video.play();
                    resolve();
                };
            });
        });
    
    console.log(publishable_key)
    console.log(model)
    console.log(version)
    
    var toLoad = {
        model: model,
        version: version
    };

    const loadModelPromise = new Promise(function (resolve, reject) {

        roboflow
            .auth({
                publishable_key: publishable_key
            })
            .load(toLoad)
            .then(function (m) {
                model = m;
                model.configure({
                    threshold: threshold,
                    overlap: overlap,
                    max_objects: max_objects
                });
                resolve();
            });
    });


    Promise.all([startVideoStreamPromise, loadModelPromise]).then(function () {
        $("body").removeClass("loading");
        resizeCanvas();
        detectFrame();
    });

    var canvas, ctx;
    const font = "16px sans-serif";

    function videoDimensions(video) {
        // Ratio of the video's intrisic dimensions
        var videoRatio = video.videoWidth / video.videoHeight;

        // The width and height of the video element
        var width = video.offsetWidth,
            height = video.offsetHeight;

        // The ratio of the element's width to its height
        var elementRatio = width / height;

        // If the video element is short and wide
        if (elementRatio > videoRatio) {
            width = height * videoRatio;
        } else {
            // It must be tall and thin, or exactly equal to the original ratio
            height = width / videoRatio;
        }

        return {
            width: width,
            height: height
        };
    }

    $(window).resize(function () {
        resizeCanvas();
    });

    const resizeCanvas = function () {
        $("canvas").remove();

        canvas = $("<canvas/>");

        ctx = canvas[0].getContext("2d");

        var dimensions = videoDimensions(video);

        console.log(
            video.videoWidth,
            video.videoHeight,
            video.offsetWidth,
            video.offsetHeight,
            dimensions
        );

        canvas[0].width = video.videoWidth;
        canvas[0].height = video.videoHeight;

        canvas.css({
            width: dimensions.width,
            height: dimensions.height,
            left: ($(window).width() - dimensions.width) / 2,
            top: ($(window).height() - dimensions.height) / 2
        });

        $("body").append(canvas);
    };

    const renderPredictions = function (predictions) {
        var dimensions = videoDimensions(video);

        var scale = 1;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        predictions.forEach(function (prediction) {
            const x = prediction.bbox.x;
            const y = prediction.bbox.y;

            const width = prediction.bbox.width;
            const height = prediction.bbox.height;

            // Draw the bounding box.
            ctx.strokeStyle = prediction.color;
            ctx.lineWidth = 4;
            ctx.strokeRect(
                (x - width / 2) / scale,
                (y - height / 2) / scale,
                width / scale,
                height / scale
            );

            // Draw the label background.
            ctx.fillStyle = prediction.color;
            const textWidth = ctx.measureText(prediction.class).width;       

            const textHeight = parseInt(font, 10); // base 10
            ctx.fillRect(
                (x - width / 2) / scale,
                (y - height / 2) / scale,
                textWidth + 8,
                textHeight + 4
            );
        });

        predictions.forEach(function (prediction) {
            const x = prediction.bbox.x;
            const y = prediction.bbox.y;

            const width = prediction.bbox.width;
            const height = prediction.bbox.height;

            // Draw the text last to ensure it's on top.
            ctx.font = font;
            ctx.textBaseline = "top";
            ctx.fillStyle = "#000000";
            ctx.fillText(
                prediction.class,
                (x - width / 2) / scale + 4,
                (y - height / 2) / scale + 1
            );
        });

        // FUNCTION FOR CONTROLLING OBS INTERACTIONS
        predictions.forEach(function (prediction) {

            console.log(prediction.class)
            const bbox = prediction.bbox
            
            // if (prediction.class === "Stop") {
            //     move_lenny(-500, -500);
            //     console.log("HIDING OBJECTS!")
            // }

            if (prediction.class === "one") {
                if (GSTATE == "start") {
                    GSTATE = "play1"
                    move_video(-800, 190)
                    start_video()
                    setTimeout(() => {
                        stop_video()
                        GSTATE = "start2"
                    }, 1900)
                }
            } else if (prediction.class === "two") {
                if (GSTATE == "start2") {
                    GSTATE = "play2"
                    move_video(-800, 190)
                    start_video()
                    setTimeout(() => {
                        stop_video()
                        GSTATE = "start3"
                    }, 2800)
                }
            } else if (prediction.class === "three") {
                if (GSTATE == "start3") {
                    GSTATE = "play3"
                    move_video(10, 190)
                    start_video()
                }
            // } else if (prediction.class === "four" || prediction.class == "five") {
            //     if (GSTATE === "play3") {
            //         scale_video(0.01)
            //     }
            } else if (prediction.class === "zero") {
                const speed = 6
                if (GSTATE === "play3") {
                    shift_video(
                        Math.sign(speed * (bbox.x - POSITION.x)),
                        Math.sign(speed * (bbox.y - POSITION.y)),
                    )
                }
            }

            // if (prediction.class === "Thumb Down") {
            //     webcam_scene_2();
            //     console.log("TURNING TO SCENE 2")
            // }

            // if (prediction.class === "Thumb Up") {
            //     webcam_scene();
            //     console.log("TURNING TO SCENE 1")
            // }

            // if (prediction.class === "Down") {
            //     console.log("MOVE LENNY DOWN!")
            //     move_lenny(dimensions.width/2, dimensions.height*0.75);
            // }

            // if (prediction.class === "Up") {
            //     console.log("MOVE LENNY UP!")
            //     move_lenny(dimensions.width/2, dimensions.height*0.25);
            // }
        });
    };

    var prevTime;
    var pastFrameTimes = [];
    const detectFrame = function () {
        if (!model) return requestAnimationFrame(detectFrame);

        model
            .detect(video)
            .then(function (predictions) {
                requestAnimationFrame(detectFrame);
                renderPredictions(predictions);

                if (prevTime) {
                    pastFrameTimes.push(Date.now() - prevTime);
                    if (pastFrameTimes.length > 30) pastFrameTimes.shift();

                    var total = 0;
                    _.each(pastFrameTimes, function (t) {
                        total += t / 1000;
                    });

                    var fps = pastFrameTimes.length / total;
                    $("#fps").text(Math.round(fps));
                }
                prevTime = Date.now();
            })
            .catch(function (e) {
                console.log("CAUGHT", e);
                requestAnimationFrame(detectFrame);
            });
    };
});
