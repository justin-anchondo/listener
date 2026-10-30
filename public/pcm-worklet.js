// Runs on the audio thread. Copies each mic frame to the main thread, where it
// is downsampled and sent to the transcription socket. Nothing is stored.
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice(0));
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
