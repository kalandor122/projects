FROM eclipse-mosquitto:latest

# Copy the config into the image so we don't need a bind mount
COPY mosquitto.conf /mosquitto/config/mosquitto.conf
