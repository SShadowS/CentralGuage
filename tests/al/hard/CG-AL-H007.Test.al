codeunit 80008 "CG-AL-H007 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        ValidationEngine: Codeunit "CG Validation Engine";

    [Test]
    procedure TestCreateValidationError_HasCorrectMessage()
    var
        ErrInfo: ErrorInfo;
    begin
        ErrInfo := ValidationEngine.CreateValidationError(
            "CG Validation Error"::EmptyField,
            'CustomerName',
            'Field cannot be empty');

        Assert.AreEqual('Field cannot be empty', ErrInfo.Message, 'ErrorInfo message incorrect');
    end;

    [Test]
    procedure TestCreateValidationError_HasErrorCodeInDimensions()
    var
        ErrInfo: ErrorInfo;
        ErrorCodeText: Text;
    begin
        ErrInfo := ValidationEngine.CreateValidationError(
            "CG Validation Error"::InvalidFormat,
            'Email',
            'Invalid email format');

        ErrorCodeText := ErrInfo.CustomDimensions.Get('ErrorCode');
        Assert.AreEqual('2', ErrorCodeText, 'ErrorCode should be 2 for InvalidFormat');
    end;

    [Test]
    procedure TestCreateValidationError_HasFieldNameInDimensions()
    var
        ErrInfo: ErrorInfo;
        FieldNameText: Text;
    begin
        ErrInfo := ValidationEngine.CreateValidationError(
            "CG Validation Error"::OutOfRange,
            'Quantity',
            'Out of range');

        FieldNameText := ErrInfo.CustomDimensions.Get('FieldName');
        Assert.AreEqual('Quantity', FieldNameText, 'FieldName should be stored in CustomDimensions');
    end;

    [Test]
    procedure TestGetErrorCode_ReturnsCorrectEnum()
    var
        ErrInfo: ErrorInfo;
        ResultCode: Enum "CG Validation Error";
    begin
        ErrInfo := ValidationEngine.CreateValidationError(
            "CG Validation Error"::DuplicateValue,
            'Code',
            'Duplicate');

        ResultCode := ValidationEngine.GetErrorCode(ErrInfo);
        Assert.AreEqual("CG Validation Error"::DuplicateValue, ResultCode, 'Should extract correct error code');
    end;

    [Test]
    procedure TestValidateNotEmpty_ErrorsOnEmptyValue()
    begin
        asserterror ValidationEngine.ValidateNotEmpty('', 'TestField');
        Assert.ExpectedError('Field cannot be empty');
    end;

    [Test]
    procedure TestValidateNotEmpty_NoErrorOnValue()
    begin
        // Should not error
        ValidationEngine.ValidateNotEmpty('SomeValue', 'TestField');
    end;

    [Test]
    procedure TestValidateInRange_ErrorsWhenBelowMin()
    begin
        asserterror ValidationEngine.ValidateInRange(5, 10, 100, 'Amount');
        Assert.ExpectedError('Value must be between');
    end;

    [Test]
    procedure TestValidateInRange_ErrorsWhenAboveMax()
    begin
        asserterror ValidationEngine.ValidateInRange(150, 10, 100, 'Amount');
        Assert.ExpectedError('Value must be between');
    end;

    [Test]
    procedure TestValidateInRange_NoErrorWhenInRange()
    begin
        // Should not error
        ValidationEngine.ValidateInRange(50, 10, 100, 'Amount');
    end;

    [Test]
    procedure TestValidateInRange_NoErrorAtBoundaries()
    begin
        // At min boundary
        ValidationEngine.ValidateInRange(10, 10, 100, 'Amount');
        // At max boundary
        ValidationEngine.ValidateInRange(100, 10, 100, 'Amount');
    end;
}
