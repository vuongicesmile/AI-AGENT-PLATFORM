import { IInputs, IOutputs } from "./generated/ManifestTypes";

export class PL400component implements ComponentFramework.StandardControl<IInputs, IOutputs> {

    private _notifyOutputChanged: () => void;
    private myMainDiv: HTMLDivElement;
    private myTextBox: HTMLTextAreaElement;
    private myLabel: HTMLLabelElement;
    private myisUpperCaseOnly: boolean;
    private currentTextValue: string;

    /**
     * Được gọi mỗi khi người dùng nhập nội dung vào textarea.
     * Đây là chiều dữ liệu từ control gửi ngược về Power Apps.
     */
    private handleTextInput = (): void => {
        let newValue = this.myTextBox.value;

        // Chỉ chuyển thành chữ hoa khi tùy chọn isUpperCaseOnly được bật.
        if (this.myisUpperCaseOnly) {
            newValue = newValue.toUpperCase();
            this.myTextBox.value = newValue;
        }

        // Lưu giá trị mới để getOutputs() trả về cho Power Apps.
        this.currentTextValue = newValue;

        // Báo cho Power Apps biết output của control đã thay đổi.
        // Sau lời gọi này, framework sẽ gọi getOutputs().
        this._notifyOutputChanged();
    };
    /**
     * Empty constructor.
     */
    constructor() {
        // Empty
    }

    /**
     * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
     * Data-set values are not initialized here, use updateView.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
     * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
     * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
     * @param container If a control is marked control-type='standard', it will receive an empty div element within which it can render its content.
     */
    public init(
        context: ComponentFramework.Context<IInputs>,
        notifyOutputChanged: () => void,
        state: ComponentFramework.Dictionary,
        container: HTMLDivElement
    ): void {

        // Lưu callback do Power Apps cung cấp để sử dụng khi người dùng nhập liệu.
        this._notifyOutputChanged = notifyOutputChanged;
        this.myMainDiv = document.createElement("div");

        // Tạo textarea và gán giá trị ban đầu từ property textValue.
        this.myTextBox = document.createElement("textarea");
        this.currentTextValue = context.parameters.textValue.raw ?? "";
        this.myTextBox.value = this.currentTextValue;
        this.myTextBox.addEventListener("input", this.handleTextInput);
        this.myMainDiv.appendChild(this.myTextBox);

        // Tạo label để hiển thị chế độ nhập chữ hoa.
        this.myLabel = document.createElement("label");
        this.myMainDiv.appendChild(this.myLabel);
        this.myisUpperCaseOnly = context.parameters.isUpperCaseOnly.raw ?? false;

        // Đưa toàn bộ giao diện của control vào container do Power Apps cung cấp.
        container.appendChild(this.myMainDiv);
    }


    /**
     * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
     * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
     */
    public updateView(context: ComponentFramework.Context<IInputs>): void {
        // updateView() là chiều dữ liệu từ Power Apps truyền xuống control.
        // Luôn đọc lại property vì người dùng có thể thay đổi nó trên form/harness.
        this.myisUpperCaseOnly = context.parameters.isUpperCaseOnly.raw ?? false;

        const valueFromPowerApps = context.parameters.textValue.raw ?? "";
        this.currentTextValue = this.myisUpperCaseOnly
            ? valueFromPowerApps.toUpperCase()
            : valueFromPowerApps;

        this.myTextBox.value = this.currentTextValue;

        // Label chỉ dùng để hiển thị trạng thái; label không phát sinh onchange.
        this.myLabel.textContent = this.myisUpperCaseOnly
            ? "Upper case only"
            : "Upper/Lower case";

        // Không gọi notifyOutputChanged() tại đây để tránh vòng lặp updateView().
    }

    /**
     * It is called by the framework prior to a control receiving new data.
     * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as "bound" or "output"
     */
    public getOutputs(): IOutputs {
        return {
            // Chỉ trả về giá trị do textarea của control thay đổi.
            textValue: this.currentTextValue
        };
    }

    /**
     * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
     * i.e. cancelling any pending remote calls, removing listeners, etc.
     */
    public destroy(): void {
        // Gỡ event listener khi control bị hủy để tránh rò rỉ bộ nhớ.
        this.myTextBox.removeEventListener("input", this.handleTextInput);
    }
}
