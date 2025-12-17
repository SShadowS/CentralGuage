codeunit 80045 "CG-AL-E045 Test"
{
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;

    [Test]
    procedure TestPositiveDistanceCalculation()
    var
        VehicleLog: Record "Vehicle Log";
    begin
        VehicleLog.Init();
        VehicleLog."Vehicle No." := 'CAR001';
        VehicleLog."Odometer Start" := 1000;

        // Validation should trigger here
        VehicleLog.Validate("Odometer End", 1200);

        Assert.AreEqual(200, VehicleLog.Distance, 'Distance should be calculated automatically on validation');
    end;

    [Test]
    procedure TestErrorOnLowerEndReading()
    var
        VehicleLog: Record "Vehicle Log";
    begin
        VehicleLog.Init();
        VehicleLog."Odometer Start" := 5000;

        // Should error
        asserterror VehicleLog.Validate("Odometer End", 4999);

        Assert.ExpectedError('End reading cannot be lower than start reading.');
    end;

    [Test]
    procedure TestStartZero()
    var
        VehicleLog: Record "Vehicle Log";
    begin
        VehicleLog.Init();
        VehicleLog."Odometer Start" := 0;

        // Should not error
        VehicleLog.Validate("Odometer End", 100);
        Assert.AreEqual(100, VehicleLog.Distance, 'Should calculate distance correctly when start is 0');
    end;

    [Test]
    procedure TestDistanceFieldExists()
    var
        VehicleLog: Record "Vehicle Log";
    begin
        // Verify Distance field exists and can be read after calculation
        VehicleLog.Init();
        VehicleLog."Vehicle No." := 'CAR002';
        VehicleLog."Odometer Start" := 500;
        VehicleLog.Validate("Odometer End", 750);

        // Distance should be calculated and accessible
        Assert.AreEqual(250, VehicleLog.Distance, 'Distance field should exist and contain calculated value');
    end;
}