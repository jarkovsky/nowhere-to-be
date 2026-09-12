export function createAudio() {
  let context,master,engine,engineGain,noise,enabled=false,lastHorn=-10;
  async function initialize(){
    if(!context){
      const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)throw new Error('Audio unavailable');
      context=new AudioContext();master=context.createGain();master.gain.value=0;master.connect(context.destination);
      engine=context.createOscillator();engine.type='triangle';engine.frequency.value=45;
      engineGain=context.createGain();engineGain.gain.value=0;engine.connect(engineGain);engineGain.connect(master);engine.start();
      noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const wind=context.createBufferSource();wind.buffer=noise;wind.loop=true;const filter=context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=240;const gain=context.createGain();gain.gain.value=.015;wind.connect(filter);filter.connect(gain);gain.connect(master);wind.start();
    }
    await context.resume();
  }
  function note(freq,start,duration,type='sine',end=freq){const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type=type;oscillator.frequency.setValueAtTime(freq,start);oscillator.frequency.exponentialRampToValueAtTime(end,start+duration);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.11,start+.025);gain.gain.exponentialRampToValueAtTime(.001,start+duration);oscillator.connect(gain);gain.connect(master);oscillator.start(start);oscillator.stop(start+duration+.02);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}
  return {
    async toggle(){await initialize();enabled=!enabled;master.gain.setTargetAtTime(enabled?.6:0,context.currentTime,.1);return enabled;},
    async horn(kind='beep'){
      await initialize();enabled=true;master.gain.setTargetAtTime(.6,context.currentTime,.015);const now=context.currentTime;if(now-lastHorn<.45)return;lastHorn=now;
      if(kind==='bicycle'){note(1300,now,.4);note(1700,now+.12,.4);}
      else if(kind==='quack'){note(420,now,.17,'sawtooth',230);note(370,now+.2,.2,'sawtooth',190);}
      else if(kind==='twinkle'){[660,830,990,1320].forEach((f,i)=>note(f,now+i*.10,.25));}
      else {note(523,now,.24,'triangle');note(659,now,.24,'triangle');}
    },
    surface(kind){if(!enabled||!context)return;const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=noise;filter.type='bandpass';filter.frequency.value=kind==='leaves'?2200:kind==='snow'?700:450;gain.gain.setValueAtTime(kind==='leaves'?.07:.045,context.currentTime);gain.gain.exponentialRampToValueAtTime(.001,context.currentTime+.17);source.connect(filter);filter.connect(gain);gain.connect(master);source.start();source.stop(context.currentTime+.18);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};},
    update(speed,active,preview=false){if(context){engine.frequency.setTargetAtTime(40+Math.abs(speed)*5,context.currentTime,.1);engineGain.gain.setTargetAtTime(active?.035+Math.abs(speed)*.003:0,context.currentTime,.15);master.gain.setTargetAtTime(enabled&&(active||preview)?.6:0,context.currentTime,.15);}},
  };
}
