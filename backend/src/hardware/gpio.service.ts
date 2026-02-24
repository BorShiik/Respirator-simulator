import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';

export interface EncoderEvent {
  encoderId: string;
  direction: 'cw' | 'ccw'; // clockwise / counter-clockwise
  clicks: number;
}

export interface ButtonEvent {
  encoderId: string;
  action: 'press' | 'release' | 'longPress';
}

// Конфигурация пинов для HW-040 энкодера
interface EncoderPins {
  clk: number;  // CLK пин
  dt: number;   // DT пин
  sw: number;   // SW (кнопка) пин
}

// Настройки по умолчанию для одного энкодера
const DEFAULT_ENCODER_PINS: EncoderPins = {
  clk: 17,  // GPIO17 (физ. пин 11)
  dt: 18,   // GPIO18 (физ. пин 12)
  sw: 27,   // GPIO27 (физ. пин 13)
};

/**
 * GPIO Service для работы с энкодером HW-040.
 * Автоматически определяет режим: mock (PC) или реальный GPIO (Raspberry Pi).
 */
@Injectable()
export class GpioService extends EventEmitter implements OnModuleDestroy {
  private readonly logger = new Logger(GpioService.name);
  
  private encoderValues: Map<string, number> = new Map();
  private mockInterval: NodeJS.Timeout | null = null;
  private isRealGpio = false;
  
  // Для реального GPIO (pigpio)
  private gpio: any = null;
  private encoderClk: any = null;
  private encoderDt: any = null;
  private encoderSw: any = null;
  private lastClkState: number = 1;
  private buttonPressed = false;
  private buttonPressTime = 0;
  
  // Текущий выбранный параметр (для изменения энкодером)
  private selectedParameter: string = 'trigger';

  constructor() {
    super();
    this.initGpio();
  }

  /**
   * Инициализация GPIO - автоматический выбор режима
   */
  private async initGpio() {
    // Пробуем инициализировать реальный GPIO
    try {
      // Проверяем, доступен ли pigpio (только на Raspberry Pi)
      const Gpio = await this.loadPigpio();
      
      if (Gpio) {
        this.initRealEncoder(Gpio);
        this.isRealGpio = true;
        this.logger.log('GPIO: Реальный энкодер подключен (Raspberry Pi)');
      } else {
        this.initMockMode();
        this.logger.log('GPIO: Mock режим (разработка на PC)');
      }
    } catch (error) {
      this.initMockMode();
      this.logger.log('GPIO: Mock режим (pigpio недоступен)');
    }
  }

  /**
   * Загрузка библиотеки pigpio
   */
  private async loadPigpio(): Promise<any> {
    try {
      // Динамический импорт pigpio
      const pigpio = await import('pigpio');
      return pigpio.Gpio;
    } catch {
      return null;
    }
  }

  /**
   * Инициализация реального энкодера на Raspberry Pi
   */
  private initRealEncoder(Gpio: any) {
    const pins = DEFAULT_ENCODER_PINS;
    
    // Создаём GPIO объекты
    this.encoderClk = new Gpio(pins.clk, {
      mode: Gpio.INPUT,
      pullUpDown: Gpio.PUD_UP,
      edge: Gpio.EITHER_EDGE,
    });
    
    this.encoderDt = new Gpio(pins.dt, {
      mode: Gpio.INPUT,
      pullUpDown: Gpio.PUD_UP,
    });
    
    this.encoderSw = new Gpio(pins.sw, {
      mode: Gpio.INPUT,
      pullUpDown: Gpio.PUD_UP,
      edge: Gpio.FALLING_EDGE,
    });
    
    // Читаем начальное состояние
    this.lastClkState = this.encoderClk.digitalRead();
    
    // Обработчик вращения энкодера
    this.encoderClk.on('interrupt', (level: number) => {
      const dtState = this.encoderDt.digitalRead();
      
      if (level !== this.lastClkState) {
        if (dtState !== level) {
          // По часовой стрелке (CW)
          this.emitEncoderEvent('cw');
        } else {
          // Против часовой стрелки (CCW)
          this.emitEncoderEvent('ccw');
        }
        this.lastClkState = level;
      }
    });
    
    // Обработчик нажатия кнопки
    this.encoderSw.on('interrupt', () => {
      const now = Date.now();
      
      if (!this.buttonPressed) {
        this.buttonPressed = true;
        this.buttonPressTime = now;
        
        // Сбрасываем флаг через 300ms (защита от дребезга)
        setTimeout(() => {
          this.buttonPressed = false;
          
          // Проверяем длинное нажатие (>1 сек)
          const pressDuration = Date.now() - this.buttonPressTime;
          if (pressDuration > 1000) {
            this.emitButtonEvent('longPress');
          } else {
            this.emitButtonEvent('press');
          }
        }, 300);
      }
    });
    
    this.logger.log(`Энкодер подключен: CLK=GPIO${pins.clk}, DT=GPIO${pins.dt}, SW=GPIO${pins.sw}`);
  }

  /**
   * Инициализация mock режима для разработки
   */
  private initMockMode() {
    // Определяем какие параметры контролирует энкодер
    this.encoderValues.set('encoder-main', 0);
  }

  /**
   * Отправка события вращения энкодера
   */
  private emitEncoderEvent(direction: 'cw' | 'ccw') {
    const event: EncoderEvent = {
      encoderId: 'encoder-main',
      direction,
      clicks: 1,
    };
    
    this.logger.debug(`Энкодер: ${direction === 'cw' ? '→ CW' : '← CCW'}`);
    this.emit('encoder', event);
  }

  /**
   * Отправка события кнопки
   */
  private emitButtonEvent(action: 'press' | 'release' | 'longPress') {
    const event: ButtonEvent = {
      encoderId: 'encoder-main',
      action,
    };
    
    this.logger.debug(`Кнопка: ${action}`);
    this.emit('button', event);
  }

  /**
   * Установка текущего выбранного параметра
   */
  setSelectedParameter(parameter: string) {
    // Validate parameter against config
    if (this.getParameterConfig().hasOwnProperty(parameter)) {
        this.selectedParameter = parameter;
        this.logger.log(`Выбран параметр: ${parameter}`);
        this.emit('parameterChanged', parameter);
    }
  }

  /**
   * Выбор следующего параметра (циклически)
   */
  selectNextParameter() {
    const params = Object.keys(this.getParameterConfig());
    const currentIndex = params.indexOf(this.selectedParameter);
    const nextIndex = (currentIndex + 1) % params.length;
    this.setSelectedParameter(params[nextIndex]);
  }

  /**
   * Получение текущего выбранного параметра
   */
  getSelectedParameter(): string {
    return this.selectedParameter;
  }

  /**
   * Проверка режима работы
   */
  isRealGpioMode(): boolean {
    return this.isRealGpio;
  }

  /**
   * Get configured encoder mappings
   */
  getEncoderConfig() {
    return [
      { id: 'encoder-main', parameter: 'selected', min: 0, max: 100, step: 1, label: 'Main Encoder' },
    ];
  }

  /**
   * Получение конфигурации параметров
   */
  getParameterConfig() {
    return {
      ipap: { min: 5, max: 30, step: 1, label: 'IPAP / Pinsp', unit: 'cmH₂O' },
      epap: { min: 0, max: 15, step: 1, label: 'EPAP / PEEP', unit: 'cmH₂O' },
      rr: { min: 5, max: 40, step: 1, label: 'Częstość (RR)', unit: '/min' },
      ti: { min: 0.3, max: 3.0, step: 0.1, label: 'Czas wdechu (Ti)', unit: 's' },
      trigger: { min: 0.5, max: 10, step: 0.5, label: 'Wyzwalacz', unit: 'cmH₂O' },
      vt: { min: 200, max: 1000, step: 50, label: 'Obj. oddechowa (VT)', unit: 'mL' },
    };
  }

  /**
   * Simulate encoder rotation (for UI or testing)
   */
  simulateEncoderRotation(encoderId: string, direction: 'cw' | 'ccw', clicks: number = 1) {
    const event: EncoderEvent = { encoderId, direction, clicks };
    this.emit('encoder', event);
    return event;
  }

  /**
   * Simulate button press
   */
  simulateButtonPress(encoderId: string, action: 'press' | 'release' | 'longPress' = 'press') {
    const event: ButtonEvent = { encoderId, action };
    this.emit('button', event);
    return event;
  }

  /**
   * Start mock random encoder movements (for testing)
   */
  startMockMode() {
    if (this.mockInterval) return;

    this.mockInterval = setInterval(() => {
      const direction = Math.random() > 0.5 ? 'cw' : 'ccw';
      this.simulateEncoderRotation('encoder-main', direction, 1);
    }, 2000);
  }

  /**
   * Stop mock mode
   */
  stopMockMode() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
  }

  /**
   * Calculate new parameter value based on encoder rotation
   */
  calculateNewValue(
    currentValue: number,
    config: { min: number; max: number; step: number },
    direction: 'cw' | 'ccw',
    clicks: number,
  ): number {
    const delta = config.step * clicks * (direction === 'cw' ? 1 : -1);
    let newValue = currentValue + delta;
    newValue = Math.max(config.min, Math.min(config.max, newValue));
    return Math.round(newValue * 100) / 100;
  }

  /**
   * Очистка при завершении
   */
  onModuleDestroy() {
    this.stopMockMode();
    
    // Освобождаем GPIO ресурсы
    if (this.encoderClk) {
      this.encoderClk.disableInterrupt();
    }
    if (this.encoderSw) {
      this.encoderSw.disableInterrupt();
    }
    
    this.logger.log('GPIO ресурсы освобождены');
  }
}

