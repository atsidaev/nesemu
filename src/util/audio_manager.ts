import {ChannelType} from '../nes/apu'

abstract class SoundChannel {
  protected gainNode: GainNode

  public destroy() {
    if (this.gainNode != null) {
      this.gainNode.disconnect()
      // this.gainNode = null
    }
  }

  public constructor(context: AudioContext) {
    this.gainNode = context.createGain()
    this.gainNode.gain.setValueAtTime(0, context.currentTime)
  }

  public start(): void {
  }

  public setVolume(volume: number, context: AudioContext) {
    this.gainNode.gain.setValueAtTime(volume, context.currentTime)
  }

  public setFrequency(_frequency: number) {
  }

  public setDutyRatio(_ratio: number) {
  }
}

abstract class OscillatorChannel extends SoundChannel {
  protected oscillator: OscillatorNode

  public destroy() {
    super.destroy()
    if (this.oscillator != null) {
      this.oscillator.disconnect()
      // this.oscillator = null
    }
  }

  public constructor(context: AudioContext) {
    super(context)

    this.oscillator = context.createOscillator()
    this.setupOscillator(this.oscillator, context)
  }

  public start(): void {
    this.oscillator.start()
  }

  public setFrequency(frequency: number) {
    const now = this.gainNode.context.currentTime
    this.oscillator.frequency.setValueAtTime(frequency, now)
  }

  protected abstract setupOscillator(oscillator: OscillatorNode, context: AudioContext)
}

class TriangleChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext) {
    oscillator.type = 'triangle'
    oscillator.connect(this.gainNode)
    this.gainNode.connect(context.destination)
  }
}

class SawtoothChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext) {
    oscillator.type = 'sawtooth'
    oscillator.connect(this.gainNode)
    this.gainNode.connect(context.destination)
  }
}

class NoiseChannel extends OscillatorChannel {
  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext) {
    const count = 1024
    const real = new Float32Array(count)
    const imag = new Float32Array(count)
    real[0] = imag[0] = 0  // DC
    for (let i = 1; i < count; ++i) {
      const t = Math.random() * (2 * Math.PI)
      real[i] = Math.cos(t)
      imag[i] = Math.sin(t)
    }
    const wave = context.createPeriodicWave(real, imag)
    oscillator.setPeriodicWave(wave)

    oscillator.connect(this.gainNode)
    this.gainNode.connect(context.destination)
  }
}

// Pulse with duty control.
class PulseChannel extends OscillatorChannel {
  private delay: DelayNode
  private frequency: number = 1
  private duty: number = 0.5

  public destroy() {
    super.destroy()
    if (this.delay != null) {
      this.delay.disconnect()
      // this.delay = null
    }
  }

  public setFrequency(frequency: number) {
    if (this.frequency === frequency)
      return
    this.frequency = frequency
    super.setFrequency(frequency)

    this.updateDelay()
  }

  public setDutyRatio(ratio: number) {
    if (this.duty === ratio)
      return
    this.duty = ratio
    this.updateDelay()
  }

  protected setupOscillator(oscillator: OscillatorNode, context: AudioContext) {
    oscillator.type = 'sawtooth'

    const inverter = context.createGain()
    inverter.gain.value = -1
    oscillator.connect(inverter)
    inverter.connect(this.gainNode)

    const delay = context.createDelay()
    oscillator.connect(delay)
    delay.connect(this.gainNode)
    this.delay = delay

    this.gainNode.connect(context.destination)
  }

  private updateDelay() {
    const now = this.delay.context.currentTime
    this.delay.delayTime.setValueAtTime((1.0 - this.duty) / this.frequency, now)
  }
}

function createSoundChannel(context: AudioContext, type: ChannelType): SoundChannel {
  switch (type) {
  case ChannelType.PULSE:
    return new PulseChannel(context)
  case ChannelType.TRIANGLE:
    return new TriangleChannel(context)
  case ChannelType.NOISE:
    return new NoiseChannel(context)
  case ChannelType.SAWTOOTH:
    return new SawtoothChannel(context)
  }
}

export class AudioManager {
  private static initialized: boolean = false
  private static context?: AudioContext

  private channels = new Array<SoundChannel>()
  private masterVolume: number = 0

  private static setUp(audioContextClass: any) {
    if (AudioManager.initialized)
      return
    AudioManager.initialized = true

    if (audioContextClass == null)
      return
    AudioManager.context = new audioContextClass() as AudioContext
  }

  constructor(audioContextClass: any) {
    AudioManager.setUp(audioContextClass)

    this.masterVolume = 1.0
  }

  public addChannel(type: ChannelType) {
    const context = AudioManager.context
    if (context == null)
      return

    const sc = createSoundChannel(context, type)
    sc.start()
    this.channels.push(sc)
  }

  public getChannelCount(): number {
    return this.channels.length
  }

  public release() {
    if (this.channels != null) {
      for (let channel of this.channels) {
        channel.destroy()
      }
      this.channels.length = 0
    }
  }

  public setChannelFrequency(channel: number, frequency: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setFrequency(frequency)
  }

  public setChannelVolume(channel: number, volume: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setVolume(volume * this.masterVolume, AudioManager.context)
  }

  public setChannelDutyRatio(channel: number, ratio: number): void {
    if (AudioManager.context == null)
      return
    this.channels[channel].setDutyRatio(ratio)
  }

  public setMasterVolume(volume: number): void {
    const context = AudioManager.context
    if (context == null)
      return
    this.masterVolume = volume
    if (volume <= 0) {
      this.channels.forEach(channel => {
        channel.setVolume(0, context)
      })
    }
  }
}
