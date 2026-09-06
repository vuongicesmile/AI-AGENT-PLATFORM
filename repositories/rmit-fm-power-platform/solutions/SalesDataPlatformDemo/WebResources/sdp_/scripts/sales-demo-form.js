/* Sales Demo: form events nhận executionContext; command nhận PrimaryControl. */
(function (root) {
    "use strict";
    const api = root.SalesDemo = root.SalesDemo || {};
    const notice = "sales-source-url";
    // [1] Hàm thuần: kiểm tra URL, không tải link bất kỳ do người dùng nhập.
    api.checkDriveUrl = function (value) {
        try {
            const url = new URL(String(value || "").trim());
            const match = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/view)?\/?$/.exec(url.pathname);
            if (url.protocol !== "https:" || url.hostname !== "drive.google.com" ||
                url.username || url.password || url.port || !match) return null;
            return match[1];
        } catch (_) { return null; }
    };
    api.validateUrl = function (form) {
        const attr = form.getAttribute("sdp_sourceurl"), control = form.getControl("sdp_sourceurl");
        if (!attr || !control) return false;
        control.clearNotification(notice);
        const valid = api.checkDriveUrl(attr.getValue()) !== null;
        if (!valid) control.setNotification("Nhập link file Google Drive dạng /file/d/<id>/view.", notice);
        return valid;
    };
    api.onLoad = function (context) {
        const form = context.getFormContext();
        form.data.entity.removeOnPostSave(api.onPostSave);
        form.data.entity.addOnPostSave(api.onPostSave);
        // [2] Chỉ gán mặc định khi tạo mới; giữ key của bản ghi đã có.
        if (form.ui.getFormType() === 1) {
            const setMissing = (name, value) => {
                const attr = form.getAttribute(name);
                if (attr && !attr.getValue()) attr.setValue(value);
            };
            setMissing("sdp_batchkey", "batch-" + root.crypto.randomUUID().replace(/-/g, ""));
            setMissing("sdp_runkey", "run-" + root.crypto.randomUUID().replace(/-/g, ""));
            setMissing("sdp_status", "New");
        }
        if (form.getAttribute("sdp_sourceurl")?.getValue()) api.validateUrl(form);
    };
    api.onSourceUrlChange = function (context) {
        const form = context.getFormContext();
        form.ui.clearFormNotification("sales-unsaved");
        if (api.validateUrl(form)) form.ui.setFormNotification(
            "URL đã thay đổi. Lưu batch trước khi gửi xử lý.", "INFO", "sales-unsaved");
    };
    api.onPostSave = function (context) {
        if (context.getEventArgs().getIsSaveSuccess())
            context.getFormContext().ui.clearFormNotification("sales-unsaved");
    };
    async function pageLogicalName() {
        // [3] Cấu hình theo environment, không gắn page name của tenant vào source.
        const rows = await root.Xrm.WebApi.retrieveMultipleRecords("environmentvariabledefinition",
            "?$select=defaultvalue&$filter=schemaname eq 'sdp_BatchConsolePageName'" +
            "&$expand=environmentvariabledefinition_environmentvariablevalue($select=value)");
        if (rows.entities.length !== 1) throw new Error("Chưa cấu hình sdp_BatchConsolePageName.");
        const definition = rows.entities[0];
        const current = definition.environmentvariabledefinition_environmentvariablevalue || [];
        if (current.length > 1) throw new Error("Có nhiều current value cho Batch Console.");
        const value = current.length ? current[0].value : definition.defaultvalue;
        if (!value || !/^[a-zA-Z0-9_]+$/.test(value)) throw new Error("Logical name của Batch Console chưa hợp lệ.");
        return value;
    }
    api.openBatchConsole = async function (primaryControl) {
        const form = primaryControl;
        const id = (form.data.entity.getId() || "").replace(/[{}]/g, "");
        if (!id || form.data.entity.getIsDirty()) {
            await root.Xrm.Navigation.openAlertDialog({ text: "Hãy lưu batch trước khi mở trang theo dõi." });
            return;
        }
        try {
            const name = await pageLogicalName();
            // [4] recordId là GUID của dòng Dataverse, không phải BatchKey.
            await root.Xrm.Navigation.navigateTo({ pageType: "custom", name,
                entityName: "sdp_pipelinebatch", recordId: id },
            { target: 2, position: 1, width: { value: 80, unit: "%" }, title: "Theo dõi batch" });
            await form.data.refresh(false);
        } catch (error) {
            root.console.error("SalesDemo.openBatchConsole", error);
            await root.Xrm.Navigation.openAlertDialog({ text: "Không mở được Batch Console. " + error.message });
        }
    };
})(typeof window !== "undefined" ? window : globalThis);
