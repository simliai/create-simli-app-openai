import IconSparkleLoader from "@/media/IconSparkleLoader";
import React, { useCallback, useRef, useState, useEffect } from "react";
import { SimliClient } from "simli-client";
import VideoBox from "./Components/VideoBox";
import cn from "./utils/TailwindMergeAndClsx";

interface SimliOpenAIProps {
  simli_faceid: string;
  openai_voice: "alloy"|"ash"|"ballad"|"coral"|"echo"|"sage"|"shimmer"|"verse";
  openai_model: string;
  initialPrompt: string;
  onStart: () => void;
  onClose: () => void;
  showDottedFace: boolean;
}

const simliClient = new SimliClient();

const SimliOpenAI: React.FC<SimliOpenAIProps> = ({
  simli_faceid,
  openai_voice,
  openai_model,
  initialPrompt,
  onStart,
  onClose,
  showDottedFace,
}) => {
  // State management
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarVisible, setIsAvatarVisible] = useState(false);
  const [error, setError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [userMessage, setUserMessage] = useState("...");

  // Refs for various components and states
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // WebRTC refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  
  // Refs for local audio (microphone)
  const localStreamRef = useRef<MediaStream | null>(null); // Renamed from streamRef for clarity

  // Refs for processing remote audio (from OpenAI for Simli)
  const remoteAudioContextRef = useRef<AudioContext | null>(null);
  const remoteStreamProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const remoteAudioSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const isFirstRun = useRef(true);

  // Refs for managing audio chunk delay for Simli
  const audioChunkQueueRef = useRef<Int16Array[]>([]);
  const isProcessingChunkRef = useRef(false);

  // Effect to cleanup WebRTC and AudioContext resources on component unmount
  useEffect(() => {
    return () => {
      console.log("SimliOpenAI unmounting, cleaning up resources...");
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
      
      remoteStreamProcessorRef.current?.disconnect();
      remoteAudioSourceNodeRef.current?.disconnect();
      if (remoteAudioContextRef.current?.state !== "closed") {
        remoteAudioContextRef.current?.close().catch(e => console.error("Error closing remote audio context:", e));
      }
      
      localStreamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  /**
   * Initializes the Simli client with the provided configuration.
   */
  const initializeSimliClient = useCallback(() => {
    if (videoRef.current && audioRef.current) {
      const SimliConfig = {
        apiKey: process.env.NEXT_PUBLIC_SIMLI_API_KEY,
        faceID: "asian_man_2",
        handleSilence: false,
        maxSessionLength: 6000, // in seconds
        maxIdleTime: 6000, // in seconds
        videoRef: videoRef.current,
        audioRef: audioRef.current,
        enableConsoleLogs: true,
        SimliURL: "://35.204.121.205:8892",
      };

      simliClient.Initialize(SimliConfig as any);
      console.log("Simli Client initialized");
    }
  }, [simli_faceid]);

  const sendDataChannelMessage = useCallback((message: object) => {
    if (dataChannelRef.current && dataChannelRef.current.readyState === "open") {
      dataChannelRef.current.send(JSON.stringify(message));
    } else {
      console.warn("Data channel not open, cannot send message:", message);
    }
  }, []);

  const sendInitialSessionConfig = useCallback(() => {
    const sessionUpdatePayload = {
      type: "session.update",
      session: {
        instructions: initialPrompt,
        voice: openai_voice,
        turn_detection: { type: "server_vad" }, // Ensure this is valid for the new API
        // For transcription, new models like 'gpt-4o-transcribe' are mentioned.
        // 'whisper-1' might be for older APIs or specific configurations. Verify this.
        input_audio_transcription: { model: "whisper-1" }, 
      },
    };
    sendDataChannelMessage(sessionUpdatePayload);
    console.log("Sent session.update to configure session.");

    // Automatically create a response to start the conversation
    sendDataChannelMessage({
      type: "response.create",
      response: { modalities: ["audio", "text"] },
    });
    console.log("Sent response.create to initiate conversation.");
  }, [initialPrompt, openai_voice, sendDataChannelMessage]);

  /**
   * Handles the end of user speech.
   */
  const handleSpeechStopped = useCallback((event: any) => {
    console.log("Speech stopped event received", event);
  }, []);

  const handleOpenAIEvent = useCallback((eventData: any) => {
    console.log("OpenAI Data Channel Event:", eventData);
    switch (eventData.type) {
      case "session.created":
        console.log("OpenAI Session created:", eventData.session);
        // Session is created, now send our specific configurations
        sendInitialSessionConfig();
        break;
      case "session.updated":
        console.log("OpenAI Session updated:", eventData.session);
        break;
      case "conversation.item.created":
        if (eventData.item?.type === "message" && eventData.item?.role === "user") {
          // Assuming user transcriptions might come via a 'message' item.
          // The new API docs are more focused on `input_audio_buffer.speech_stopped` and then full transcript in `response.done`.
          // This part might need adjustment based on actual events for user transcriptions.
          if (eventData.item.content && eventData.item.content[0]?.transcript) {
            setUserMessage(eventData.item.content[0].transcript);
          } else if (eventData.item.content && eventData.item.content[0]?.text) {
             setUserMessage(eventData.item.content[0].text);
          }
        }
        break;
      case "response.text.delta":
        // Handle streaming text from assistant if needed for UI
        // e.g., setAssistantPartialTranscript(current => current + eventData.delta);
        break;
      case "response.done":
        console.log("OpenAI Response done:", eventData.response);
        if (eventData.response?.output) {
          const assistantMessage = eventData.response.output.find(
            (out: any) => out.type === "text" || (out.type === "message" && out.role === "assistant")
          );
          if (assistantMessage?.text) {
            // This might be where the final assistant text comes for UI update, if not handled by Simli.
            // For now, Simli handles audio, and user messages are updated elsewhere.
          }
          const userTranscriptionItem = eventData.response.output.find(
            (out: any) => out.type === "input_text" || (out.type === "message" && out.role === "user")
          );
          if (userTranscriptionItem?.text) {
             setUserMessage(userTranscriptionItem.text);
          }
        }
        break;
      case "input_audio_buffer.speech_started":
        console.log("User speech started (VAD)");
        break;
      case "input_audio_buffer.speech_stopped":
        console.log("User speech stopped (VAD)", eventData);
        handleSpeechStopped(eventData); 
        // After user speech stops, a `response.done` event often contains the transcription.
        break;
      // The 'conversation.interrupted' event from the old API might map to different VAD behaviors
      // or might not have a direct 1:1 mapping. The new API focuses on turn_detection settings.
      // case "conversation.interrupted": 
      //   interruptConversation();
      //   break;
      case "error":
      case "invalid_request_error":
        console.error("OpenAI Error Event:", eventData);
        setError(`OpenAI Error: ${eventData.message || JSON.stringify(eventData)}`);
        break;
      default:
        // console.log("Unhandled OpenAI event type:", eventData.type);
        break;
    }
  }, [handleSpeechStopped, sendInitialSessionConfig]);

  /**
   * Applies a simple low-pass filter to prevent aliasing of audio
   */
  const applyLowPassFilter = (
    data: Int16Array,
    cutoffFreq: number,
    sampleRate: number
  ): Int16Array => {
    // Simple FIR filter coefficients
    const numberOfTaps = 31; // Should be odd
    const coefficients = new Float32Array(numberOfTaps);
    const fc = cutoffFreq / sampleRate;
    const middle = (numberOfTaps - 1) / 2;

    // Generate windowed sinc filter
    for (let i = 0; i < numberOfTaps; i++) {
      if (i === middle) {
        coefficients[i] = 2 * Math.PI * fc;
      } else {
        const x = 2 * Math.PI * fc * (i - middle);
        coefficients[i] = Math.sin(x) / (i - middle);
      }
      // Apply Hamming window
      coefficients[i] *=
        0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (numberOfTaps - 1));
    }

    // Normalize coefficients
    const sum = coefficients.reduce((acc, val) => acc + val, 0);
    coefficients.forEach((_, i) => (coefficients[i] /= sum));

    // Apply filter
    const result = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      for (let j = 0; j < numberOfTaps; j++) {
        const idx = i - j + middle;
        if (idx >= 0 && idx < data.length) {
          sum += coefficients[j] * data[idx];
        }
      }
      result[i] = Math.round(sum);
    }

    return result;
  };

  /**
   * Downsamples audio data from one sample rate to another using linear interpolation
   * and anti-aliasing filter.
   *
   * @param audioData - Input audio data as Int16Array
   * @param inputSampleRate - Original sampling rate in Hz
   * @param outputSampleRate - Target sampling rate in Hz
   * @returns Downsampled audio data as Int16Array
   */
  const downsampleAudio = useCallback((
    audioData: Int16Array,
    inputSampleRate: number,
    outputSampleRate: number
  ): Int16Array => {
    if (inputSampleRate === outputSampleRate) {
      return audioData;
    }

    if (inputSampleRate < outputSampleRate) {
      throw new Error("Upsampling is not supported");
    }

    // Apply low-pass filter to prevent aliasing
    // Cut off at slightly less than the Nyquist frequency of the target sample rate
    const filteredData = applyLowPassFilter(
      audioData,
      outputSampleRate * 0.45, // Slight margin below Nyquist frequency
      inputSampleRate
    );

    const ratio = inputSampleRate / outputSampleRate;
    const newLength = Math.floor(audioData.length / ratio);
    const result = new Int16Array(newLength);

    // Linear interpolation
    for (let i = 0; i < newLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;

      if (index + 1 < filteredData.length) {
        const a = filteredData[index];
        const b = filteredData[index + 1];
        result[i] = Math.round(a + fraction * (b - a));
      } else {
        result[i] = filteredData[index];
      }
    }

    return result;
  }, [applyLowPassFilter]);

  /**
   * Processes the next audio chunk in the queue for Simli.
   */
  const processNextAudioChunk = useCallback(() => {
    if (
      audioChunkQueueRef.current.length > 0 &&
      !isProcessingChunkRef.current
    ) {
      isProcessingChunkRef.current = true;
      const audioChunk = audioChunkQueueRef.current.shift();
      if (audioChunk) {
        const chunkDurationMs = (audioChunk.length / 16000) * 1000; // Calculate chunk duration in milliseconds

        // Send audio chunks to Simli immediately
        simliClient?.sendAudioData(audioChunk as any);
        console.log(
          "Sent audio chunk to Simli:",
          chunkDurationMs,
          "Duration:",
          chunkDurationMs.toFixed(2),
          "ms"
        );
        isProcessingChunkRef.current = false;
        processNextAudioChunk();
      }
    }
  }, []);

  /**
   * Initializes the OpenAI client using WebRTC.
   */
  const initializeOpenAIClient = useCallback(async () => {
    try {
      console.log("Initializing OpenAI WebRTC client...");
      setIsLoading(true);

      // --- IMPORTANT SECURITY NOTE ---
      // The following uses a standard API key client-side. THIS IS INSECURE.
      // In production, you MUST fetch an EPHEMERAL KEY from your backend.
      // Example:
      // const tokenResponse = await fetch("/your-backend/generate-openai-ephemeral-key");
      // const { client_secret } = await tokenResponse.json();
      // const ephemeralKey = client_secret.value;
      const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
      if (!apiKey) {
        setError("OpenAI API key not found.");
        setIsLoading(false);
        return;
      }

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("ICE candidate:", event.candidate);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
          setError(`OpenAI connection state: ${pc.iceConnectionState}`);
          // Consider cleanup or retry logic here
        }
      };
      
      pc.ontrack = (event) => {
        console.log("Remote track received from OpenAI:", event.track);
        if (event.track.kind === "audio" && event.streams[0]) {
          const remoteStream = event.streams[0];
          
          if (!remoteAudioContextRef.current || remoteAudioContextRef.current.state === "closed") {
            remoteAudioContextRef.current = new AudioContext();
          }
          const audioCtx = remoteAudioContextRef.current;

          if (remoteStreamProcessorRef.current) {
            remoteStreamProcessorRef.current.disconnect();
          }
          if (remoteAudioSourceNodeRef.current) {
            remoteAudioSourceNodeRef.current.disconnect();
          }
          
          remoteAudioSourceNodeRef.current = audioCtx.createMediaStreamSource(remoteStream);
          remoteStreamProcessorRef.current = audioCtx.createScriptProcessor(2048, 1, 1); // Buffer size, input channels, output channels

          remoteStreamProcessorRef.current.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0); // Float32Array
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              const sample = Math.max(-1, Math.min(1, inputData[i]));
              int16Data[i] = Math.floor(sample * 32767);
            }

            // OpenAI's TTS audio is often 24kHz. Simli expects 16kHz.
            // The sampleRate of the remoteAudioContext might reflect the incoming stream's rate,
            // or it could be the device default. Assuming 24kHz from OpenAI if not detectable.
            const openAIOutputSampleRate = audioCtx.sampleRate || 24000; 
            const downsampledAudio = downsampleAudio(int16Data, openAIOutputSampleRate, 16000);
            
            audioChunkQueueRef.current.push(downsampledAudio);
            if (!isProcessingChunkRef.current) {
              processNextAudioChunk();
            }
          };
          remoteAudioSourceNodeRef.current.connect(remoteStreamProcessorRef.current);
          remoteStreamProcessorRef.current.connect(audioCtx.destination); // Essential for onaudioprocess to fire in some browsers
        }
      };

      // Get local microphone stream
      if (localStreamRef.current) { // Stop previous stream if any
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
      console.log("Local microphone track added to PeerConnection.");
      setIsRecording(true);


      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;

      dc.onopen = () => {
        console.log("OpenAI Data Channel opened.");
        // The `session.created` event should arrive first from the server.
        // We'll send `session.update` and `response.create` in its handler.
        // Or, if `session.created` is not guaranteed first, send config here.
        // For now, assuming `session.created` triggers config.
      };

      dc.onmessage = (event) => {
        try {
          const parsedEvent = JSON.parse(event.data as string);
          handleOpenAIEvent(parsedEvent);
        } catch (e) {
          console.error("Failed to parse OpenAI event:", event.data, e);
        }
      };

      dc.onclose = () => {
        console.log("OpenAI Data Channel closed.");
        setError("OpenAI data channel closed.");
      };
      dc.onerror = (err) => {
        console.error("OpenAI Data Channel error:", err);
        setError(`OpenAI data channel error: ${JSON.stringify(err)}`);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpPostUrl = `https://api.openai.com/v1/realtime?model=${openai_model}`;
      const sdpResponse = await fetch(sdpPostUrl, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${apiKey}`, // EPHEMERAL_KEY in production
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(`SDP exchange failed: ${sdpResponse.status} ${errorText}`);
      }

      const answerSdp = await sdpResponse.text();
      const answer = { type: "answer" as RTCSdpType, sdp: answerSdp };
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      
      console.log("OpenAI WebRTC client connected (SDP exchanged). Waiting for data channel open and session.created event.");
      setIsAvatarVisible(true);

    } catch (error: any) {
      console.error("Error initializing OpenAI WebRTC client:", error);
      setError(`Failed to initialize OpenAI client: ${error.message}`);
      setIsAvatarVisible(false);
    } finally {
      setIsLoading(false);
    }
  }, [openai_model, handleOpenAIEvent, processNextAudioChunk, downsampleAudio, sendInitialSessionConfig]);

  const interruptConversation = useCallback(() => {
    console.warn("User interrupted the conversation (or VAD triggered interruption)");
    simliClient?.ClearBuffer();
    // The new API doc doesn't specify a client-sent event for `response.cancel`.
    // This might be handled by VAD settings (`turn_detection.interrupt_response = true`).
    // Or by simply not sending further audio / closing the connection.
    // sendDataChannelMessage({ type: "response.cancel", response_id: "..." }); // If such an event exists
    console.log("Attempting to interrupt OpenAI response (mechanism may vary with WebRTC API).");
  }, [sendDataChannelMessage]);

  /**
   * Simli Event listeners
   */
  const eventListenerSimli = useCallback(() => {
    if (simliClient) {
      simliClient?.on("connected", () => {
        console.log("SimliClient connected");
        // initializeOpenAIClient(); // No longer called here
      });

      simliClient?.on("disconnected", () => {
        console.log("SimliClient disconnected");
        if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== "closed") {
            console.log("Simli disconnected, ensuring OpenAI WebRTC is also closed.");
            dataChannelRef.current?.close();
            peerConnectionRef.current?.close();
            dataChannelRef.current = null;
            peerConnectionRef.current = null;

            if (remoteStreamProcessorRef.current) remoteStreamProcessorRef.current.disconnect();
            if (remoteAudioSourceNodeRef.current) remoteAudioSourceNodeRef.current.disconnect();
            if (remoteAudioContextRef.current?.state !== "closed") {
              remoteAudioContextRef.current?.close().catch(e => console.error("Error closing remote audio context on Simli disconnect:", e));
            }
        }
      });
    }
  }, []); // Dependencies removed as it only sets up listeners and uses refs for cleanup

  /**
   * Starts audio recording from the user's microphone (now part of WebRTC setup).
   */
  const startRecording = useCallback(async () => {
    // With WebRTC, getUserMedia and track addition happen during initializeOpenAIClient.
    // This function might just be for state or can be deprecated if not controlling WebRTC setup phases.
    if (peerConnectionRef.current && localStreamRef.current) {
        console.log("Audio recording (local microphone) is active via WebRTC.");
        setIsRecording(true);
    } else {
        console.warn("WebRTC not initialized, cannot confirm recording state.");
        // Optionally, trigger initialization if not already started
        // initializeOpenAIClient(); 
    }
  }, [/*initializeOpenAIClient*/]);

  /**
   * Stops audio recording from the user's microphone
   */
  const stopRecording = useCallback(() => {
    console.log("Stopping local audio recording (microphone)...");
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      // Removing track from peer connection if connection is to be reused or kept partially open.
      // For full stop, closing the peer connection handles this.
      // peerConnectionRef.current?.getSenders().forEach(sender => {
      //   if (sender.track === localStreamRef.current?.getAudioTracks()[0]) {
      //     peerConnectionRef.current?.removeTrack(sender);
      //   }
      // });
      localStreamRef.current = null;
    }
    setIsRecording(false);
    console.log("Local audio recording stopped.");
  }, []);

  /**
   * Handles the start of the interaction, initializing clients and starting recording.
   */
  const handleStart = useCallback(async () => {
    setIsLoading(true);
    setError("");
    onStart();

    try {
      console.log("Starting interaction flow...");
      initializeSimliClient(); // Initialize Simli config
      eventListenerSimli();    // Set up Simli event listeners

      console.log("Attempting to start Simli client...");
      await simliClient?.start(); // Connect Simli client (async)
      console.log("Simli client started successfully.");

      console.log("Attempting to initialize OpenAI client...");
      await initializeOpenAIClient(); // Connect OpenAI client (async)
      console.log("OpenAI client initialized successfully.");

    } catch (error: any) {
      console.error("Error starting interaction:", error);
      setError(`Error starting interaction: ${error.message}`);
      // Ensure avatar visibility is reset if something fails early
      setIsAvatarVisible(false); 
    } finally {
      // setIsAvatarVisible(true); // This is now set within initializeOpenAIClient on success
      setIsLoading(false);
    }
  }, [onStart, initializeSimliClient, eventListenerSimli, initializeOpenAIClient]);

  /**
   * Handles stopping the interaction, cleaning up resources and resetting states.
   */
  const handleStop = useCallback(() => {
    console.log("Stopping interaction...");
    setIsLoading(false);
    setError("");
    
    stopRecording(); // Stops local microphone

    simliClient?.close();

    // Close WebRTC connection
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    console.log("OpenAI WebRTC connection closed.");

    // Clean up remote audio processing chain
    if (remoteStreamProcessorRef.current) {
        remoteStreamProcessorRef.current.disconnect();
        remoteStreamProcessorRef.current = null;
    }
    if (remoteAudioSourceNodeRef.current) {
        remoteAudioSourceNodeRef.current.disconnect();
        remoteAudioSourceNodeRef.current = null;
    }
    if (remoteAudioContextRef.current && remoteAudioContextRef.current.state !== "closed") {
      remoteAudioContextRef.current.close().then(() => {
        remoteAudioContextRef.current = null;
        console.log("Remote audio context closed.");
      }).catch(e => console.error("Error closing remote audio context during stop:", e));
    }
    
    setIsAvatarVisible(false);
    onClose();
    console.log("Interaction stopped and resources cleaned up.");
  }, [stopRecording, onClose]);

  return (
    <>
      <div
        className={`transition-all duration-300 ${
          showDottedFace ? "h-0 overflow-hidden" : "h-auto"
        }`}
      >
        <VideoBox video={videoRef} audio={audioRef} />
      </div>
      <div className="flex flex-col items-center">
        {!isAvatarVisible ? (
          <button
            onClick={handleStart}
            disabled={isLoading}
            className={cn(
              "w-full h-[52px] mt-4 disabled:bg-[#343434] disabled:text-white disabled:hover:rounded-[100px] bg-simliblue text-white py-3 px-6 rounded-[100px] transition-all duration-300 hover:text-black hover:bg-white hover:rounded-sm",
              "flex justify-center items-center"
            )}
          >
            {isLoading ? (
              <IconSparkleLoader className="h-[20px] animate-loader" />
            ) : (
              <span className="font-abc-repro-mono font-bold w-[164px]">
                Test Interaction
              </span>
            )}
          </button>
        ) : (
          <>
            <div className="flex items-center gap-4 w-full">
              <button
                onClick={handleStop}
                className={cn(
                  "mt-4 group text-white flex-grow bg-red hover:rounded-sm hover:bg-white h-[52px] px-6 rounded-[100px] transition-all duration-300"
                )}
              >
                <span className="font-abc-repro-mono group-hover:text-black font-bold w-[164px] transition-all duration-300">
                  Stop Interaction
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default SimliOpenAI;
