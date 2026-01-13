# Настройка энкодера HW-040 на Raspberry Pi

## Подключение

| Пин энкодера | GPIO | Физ. пин |
| ------------ | ---- | -------- |
| CLK          | 17   | 11       |
| DT           | 18   | 12       |
| SW           | 27   | 13       |
| +            | 3.3V | 1        |
| GND          | GND  | 9        |

## Установка зависимостей

### На Raspberry Pi:

```bash
# Установка pigpio
sudo apt update
sudo apt install pigpio python3-pigpio

# Запуск демона pigpio (нужен для работы библиотеки)
sudo pigpiod

# Установка npm пакета pigpio
cd ~/respirator-simulator/backend
npm install pigpio
```

### Автозапуск pigpiod:

```bash
sudo systemctl enable pigpiod
sudo systemctl start pigpiod
```

## Тестирование

### 1. Python тест (без бэкенда):

```bash
cd ~/respirator-simulator/backend/scripts
python3 test_encoder.py
```

Ожидаемый вывод при вращении:

```
→ CW  (по часовой)     | Счётчик: 1
→ CW  (по часовой)     | Счётчик: 2
← CCW (против часовой) | Счётчик: 1
● КНОПКА НАЖАТА        | Счётчик сброшен
```

### 2. Проверка GPIO пинов:

```bash
# Установка gpio утилиты
sudo apt install wiringpi

# Просмотр состояния пинов
gpio readall
```

### 3. Запуск бэкенда:

```bash
cd ~/respirator-simulator/backend
npm run start:dev
```

В логах должно появиться:

```
[GpioService] GPIO: Реальный энкодер подключен (Raspberry Pi)
[GpioService] Энкодер подключен: CLK=GPIO17, DT=GPIO27, SW=GPIO22
```

## Устранение проблем

### Энкодер не реагирует:

1. Проверь подключение проводов
2. Убедись что pigpiod запущен: `sudo systemctl status pigpiod`
3. Проверь права доступа: `sudo usermod -a -G gpio $USER` (перелогинься)

### Скачет/дёргается:

Добавь конденсатор 100nF между CLK и GND (аппаратный debounce).

### Нет модуля pigpio:

```bash
npm install pigpio --save
```

На Windows/Mac pigpio не работает — используется mock режим автоматически.
