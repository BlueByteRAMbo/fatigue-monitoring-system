import datetime

def get_ist_time():
    """Returns the current time in IST (UTC +5:30)"""
    # IST = UTC + 5h 30m
    return datetime.datetime.utcnow() + datetime.timedelta(hours=5, minutes=30)
