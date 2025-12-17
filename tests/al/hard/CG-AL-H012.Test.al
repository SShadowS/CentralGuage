codeunit 80013 "CG-AL-H012 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    // Note: Control add-ins cannot be directly tested in AL unit tests
    // because they require a client-side JavaScript runtime.
    // These tests verify the control add-in compiles and its signature is correct
    // by checking if a page that uses the control add-in compiles.

    [Test]
    procedure TestControlAddInExists()
    begin
        // This test verifies the control add-in definition compiles
        // The actual control add-in functionality requires client-side testing
        Assert.IsTrue(true, 'Control add-in should compile successfully');
    end;

    [Test]
    procedure TestControlAddInPageIntegration()
    var
        TestPage: Page "CG Data Visualizer Test Page";
    begin
        // Verify a page can reference the control add-in
        // This ensures the control add-in is properly defined
        Assert.IsTrue(true, 'Page with control add-in should compile');
    end;
}
