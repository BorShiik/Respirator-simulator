#!/usr/bin/env python3
"""
Тестовый скрипт для проверки энкодера HW-040 на Raspberry Pi.

Подключение:
  CLK -> GPIO17 (пин 11)
  DT  -> GPIO27 (пин 13)
  SW  -> GPIO22 (пин 15)
  +   -> 3.3V   (пин 1)
  GND -> GND    (пин 6)

Использование:
  python3 test_encoder.py

При вращении энкодера будет выводиться направление и значение счётчика.
При нажатии кнопки — сообщение о нажатии.
"""

import RPi.GPIO as GPIO
import time
import sys

# ============ НАСТРОЙКИ ПИНОВ ============
# Подключение пользователя:
# Физ. пин 11 -> GPIO17 (CLK)
# Физ. пин 12 -> GPIO18 (DT)
# Физ. пин 13 -> GPIO27 (SW)
# Физ. пин 1  -> 3.3V (+)
# Физ. пин 9  -> GND
PIN_CLK = 17  # CLK энкодера
PIN_DT = 18   # DT энкодера  
PIN_SW = 27   # SW (кнопка) энкодера
# =========================================

# Состояние
counter = 0
last_clk_state = None
button_pressed = False

def setup():
    """Инициализация GPIO"""
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    
    # CLK и DT — входы с подтяжкой к питанию
    GPIO.setup(PIN_CLK, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.setup(PIN_DT, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    GPIO.setup(PIN_SW, GPIO.IN, pull_up_down=GPIO.PUD_UP)
    
    print("=" * 50)
    print("ТЕСТ ЭНКОДЕРА HW-040")
    print("=" * 50)
    print(f"CLK -> GPIO{PIN_CLK}")
    print(f"DT  -> GPIO{PIN_DT}")
    print(f"SW  -> GPIO{PIN_SW}")
    print("=" * 50)
    print("Вращай энкодер и нажимай кнопку...")
    print("Ctrl+C для выхода")
    print("=" * 50)

def read_encoder():
    """Читает состояние энкодера и возвращает направление"""
    global last_clk_state, counter
    
    clk_state = GPIO.input(PIN_CLK)
    dt_state = GPIO.input(PIN_DT)
    
    if last_clk_state is None:
        last_clk_state = clk_state
        return None
    
    # Детектируем изменение на CLK
    if clk_state != last_clk_state:
        if dt_state != clk_state:
            # По часовой стрелке (CW)
            counter += 1
            last_clk_state = clk_state
            return 'CW'
        else:
            # Против часовой стрелки (CCW)
            counter -= 1
            last_clk_state = clk_state
            return 'CCW'
    
    return None

def read_button():
    """Читает состояние кнопки"""
    global button_pressed
    
    sw_state = GPIO.input(PIN_SW)
    
    # Кнопка нажата (LOW при нажатии из-за pull-up)
    if sw_state == GPIO.LOW and not button_pressed:
        button_pressed = True
        return True
    elif sw_state == GPIO.HIGH:
        button_pressed = False
    
    return False

def main():
    global counter
    
    try:
        setup()
        
        while True:
            # Проверяем энкодер
            direction = read_encoder()
            if direction:
                if direction == 'CW':
                    print(f"→ CW  (по часовой)     | Счётчик: {counter}")
                else:
                    print(f"← CCW (против часовой) | Счётчик: {counter}")
            
            # Проверяем кнопку
            if read_button():
                print(f"● КНОПКА НАЖАТА        | Счётчик сброшен")
                counter = 0
            
            time.sleep(0.001)  # 1ms задержка
            
    except KeyboardInterrupt:
        print("\n" + "=" * 50)
        print("Тест завершён")
        print("=" * 50)
    finally:
        GPIO.cleanup()

if __name__ == "__main__":
    # Проверяем что запущено на Raspberry Pi
    try:
        import RPi.GPIO
    except ImportError:
        print("ОШИБКА: Этот скрипт нужно запускать на Raspberry Pi!")
        print("Установи библиотеку: sudo apt install python3-rpi.gpio")
        sys.exit(1)
    
    main()
