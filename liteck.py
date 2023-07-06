import RPi.GPIO as GPIO
import time

GPIO.setmode(GPIO.BOARD)

#define the physical pin that goes to the circuit
pin_to_circuit = 11

def rc_time (pin):
    count = 0

    #Output on the pin for
    GPIO.setup(pin, GPIO.OUT)
    #If sensor not connected just return a big number
#    if (GPIO.input(pin) == GPIO.LOW):
#        return 'NO-SENSOR'
    GPIO.output(pin, GPIO.LOW)
    time.sleep(0.1)

    #Change the pin back to input
    GPIO.setup(pin, GPIO.IN)

    #Count until the pin goes high
    while (GPIO.input(pin) == GPIO.LOW):
        count += 1

    return count

rc = rc_time(pin_to_circuit)
GPIO.cleanup()
print(rc)

