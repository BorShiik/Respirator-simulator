import sys
import time
import os
import signal

# Set environment variable to force lgpio or rpigpio if needed, but gpiozero defaults to best available
try:
    from gpiozero import RotaryEncoder, Button
except ImportError:
    print("ERROR:gpiozero_missing", flush=True)
    sys.exit(1)

# Default pin configuration (BCM)
CLK_PIN = 17
DT_PIN = 18
SW_PIN = 27

# Global objects for signal handling
encoder = None
button = None

def signal_handler(sig, frame):
    """Graceful termination handler"""
    print("\nTERMINATING:Signal received", flush=True)
    if encoder:
        encoder.close()
    if button:
        button.close()
    sys.exit(0)

def main():
    global encoder, button
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # Initialize hardware
        # max_steps=0 allows infinite rotation
        encoder = RotaryEncoder(CLK_PIN, DT_PIN, max_steps=0)
        # BCM 27 (Pin 13)
        button = Button(SW_PIN, pull_up=True, bounce_time=0.05)

        def get_timestamp():
            return int(time.time() * 1000)

        def cw():
            print(f"ENCODER:CW:{get_timestamp()}", flush=True)

        def ccw():
            print(f"ENCODER:CCW:{get_timestamp()}", flush=True)

        def pressed():
            print(f"BUTTON:PRESS:{get_timestamp()}", flush=True)

        encoder.when_rotated_clockwise = cw
        encoder.when_rotated_counter_clockwise = ccw
        button.when_pressed = pressed

        # Let the backend know we are fully initialized
        print("READY", flush=True)
        
        # Keep alive and heartbeat every 10 seconds
        while True:
            time.sleep(10)
            print("HEARTBEAT", flush=True)
            
    except Exception as e:
        print(f"ERROR:{e}", flush=True)
        sys.exit(1)

if __name__ == '__main__':
    main()
