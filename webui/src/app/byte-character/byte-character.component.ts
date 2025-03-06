import { Component, Input } from '@angular/core'

@Component({
    selector: 'app-byte-character',
    templateUrl: './byte-character.component.html',
    styleUrl: './byte-character.component.sass',
})
export class ByteCharacterComponent {
    /**
     * Byte character value.
     * It must be a number between 0 and 255.
     */
    @Input() byteValue: number

    /**
     * Indicates if the byte character is printable.
     */
    get isPrintable(): boolean {
        return this.byteValue >= 32 && this.byteValue <= 126
    }

    /**
     * Indicates if the byte character is NaN.
     */
    get isNaN(): boolean {
        return Number.isNaN(this.byteValue)
    }

    /**
     * Returns the byte character as a string.
     */
    get character(): string {
        return String.fromCharCode(this.byteValue)
    }

    /**
     * Returns the byte character as a hexadecimal string.
     */
    get hex(): string {
        return this.byteValue.toString(16).padStart(2, '0')
    }
}
