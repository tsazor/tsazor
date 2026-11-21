export class Thermostat {
    /** C#: private double _celsius = 20; */
    #celsius = 20;

    /** C#: public string Room { get; } */
    readonly room: string;

    constructor(room: string) {
        this.room = room;
    }

    /** C#: public double Celsius { get => _celsius; set { … } } */
    get celsius(): number {
        return this.#celsius;
    }

    set celsius(value: number) {
        if (value < 5 || value > 30) throw new RangeError(`${value} °C is out of range`);
        this.#celsius = value;
    }

    get fahrenheit(): number {
        return this.celsius * 9 / 5 + 32;
    }

    set fahrenheit(value: number) {
        this.celsius = (value - 32) * 5 / 9;
    }
}
