import sys
import time
import os

# Set environment variable to force lgpio or rpigpio if needed, but gpiozero defaults to best available
try:
    from gpiozero import RotaryEncoder, Button
except ImportError:
    print("ERROR:gpiozero_missing", flush=True)
    sys.exit(1)

CLK_PIN = 17
DT_PIN = 18
SW_PIN = 27

def main():
    try:
        # max_steps=0 allows infinite rotation
        encoder = RotaryEncoder(CLK_PIN, DT_PIN, max_steps=0)
        # BCM 27 (Pin 13)
        button = Button(SW_PIN, pull_up=True, bounce_time=0.05)

        def cw():
            print("ENCODER:CW", flush=True)

        def ccw():
            print("ENCODER:CCW", flush=True)

        def pressed():
            print("BUTTON:PRESS", flush=True)

        encoder.when_rotated_clockwise = cw
        encoder.when_rotated_counter_clockwise = ccw
        button.when_pressed = pressed

        print("READY", flush=True)
        
        # Keep alive
        while True:
            time.sleep(1)
            
    except Exception as e:
        print(f"ERROR:{e}", flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
