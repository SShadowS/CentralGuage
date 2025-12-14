codeunit 80013 "CG-AL-M003 Test"
{
    // Tests for CG-AL-M003: Complex Table - Sales Contract
    Subtype = Test;
    TestPermissions = Disabled;

    var
        Assert: Codeunit Assert;
        LibrarySales: Codeunit "Library - Sales";
        LibraryRandom: Codeunit "Library - Random";

    [Test]
    procedure TestTableExists()
    var
        SalesContract: Record "Sales Contract";
    begin
        // [SCENARIO] Sales Contract table can be instantiated
        // [GIVEN] The table definition
        // [WHEN] We initialize a record
        SalesContract.Init();
        // [THEN] No error occurs
    end;

    [Test]
    procedure TestContractNoAutoGeneration()
    var
        SalesContract: Record "Sales Contract";
    begin
        // [SCENARIO] Contract No is auto-generated on insert
        // [GIVEN] A new contract without Contract No
        SalesContract.Init();
        SalesContract."Customer No." := CreateCustomer();
        SalesContract."Start Date" := WorkDate();
        SalesContract."End Date" := CalcDate('<+1Y>', WorkDate());

        // [WHEN] We insert the record
        SalesContract.Insert(true);

        // [THEN] Contract No is populated
        Assert.AreNotEqual('', SalesContract."Contract No.", 'Contract No should be auto-generated');

        // Cleanup
        SalesContract.Delete();
    end;

    [Test]
    procedure TestCustomerNoTableRelation()
    var
        SalesContract: Record "Sales Contract";
        Customer: Record Customer;
    begin
        // [SCENARIO] Customer No has table relation to Customer
        // [GIVEN] A valid customer
        LibrarySales.CreateCustomer(Customer);

        // [WHEN] We set Customer No to valid customer
        SalesContract.Init();
        SalesContract."Customer No." := Customer."No.";
        SalesContract."Start Date" := WorkDate();
        SalesContract."End Date" := CalcDate('<+1Y>', WorkDate());
        SalesContract.Insert(true);

        // [THEN] Record is saved
        Assert.AreEqual(Customer."No.", SalesContract."Customer No.", 'Customer No should be saved');

        // Cleanup
        SalesContract.Delete();
        Customer.Delete();
    end;

    [Test]
    procedure TestDateCrossValidation()
    var
        SalesContract: Record "Sales Contract";
    begin
        // [SCENARIO] End Date must be after Start Date
        // [GIVEN] A contract with invalid dates
        SalesContract.Init();
        SalesContract."Customer No." := CreateCustomer();
        SalesContract."Start Date" := WorkDate();

        // [WHEN] We set End Date before Start Date
        // [THEN] Error is raised
        asserterror SalesContract.Validate("End Date", CalcDate('<-1M>', WorkDate()));
        Assert.ExpectedError('End Date must be after Start Date');
    end;

    [Test]
    procedure TestStatusField()
    var
        SalesContract: Record "Sales Contract";
    begin
        // [SCENARIO] Status field has correct options
        // [GIVEN] A contract record
        SalesContract.Init();
        SalesContract."Customer No." := CreateCustomer();
        SalesContract."Start Date" := WorkDate();
        SalesContract."End Date" := CalcDate('<+1Y>', WorkDate());
        SalesContract.Insert(true);

        // [WHEN] We set different status values
        SalesContract.Status := SalesContract.Status::Draft;
        SalesContract.Modify();
        Assert.AreEqual(SalesContract.Status::Draft, SalesContract.Status, 'Status should be Draft');

        SalesContract.Status := SalesContract.Status::Active;
        SalesContract.Modify();
        Assert.AreEqual(SalesContract.Status::Active, SalesContract.Status, 'Status should be Active');

        // Cleanup
        SalesContract.Delete();
    end;

    [Test]
    procedure TestPreventDeleteActive()
    var
        SalesContract: Record "Sales Contract";
    begin
        // [SCENARIO] Active contracts cannot be deleted
        // [GIVEN] An active contract
        SalesContract.Init();
        SalesContract."Customer No." := CreateCustomer();
        SalesContract."Start Date" := WorkDate();
        SalesContract."End Date" := CalcDate('<+1Y>', WorkDate());
        SalesContract.Status := SalesContract.Status::Active;
        SalesContract.Insert(true);

        // [WHEN] We try to delete
        // [THEN] Error is raised
        asserterror SalesContract.Delete(true);
        Assert.ExpectedError('Cannot delete active contract');

        // Cleanup - set to closed first
        SalesContract.Status := SalesContract.Status::Closed;
        SalesContract.Modify();
        SalesContract.Delete();
    end;

    [Test]
    procedure TestContractValueValidation()
    var
        SalesContract: Record "Sales Contract";
    begin
        // [SCENARIO] Contract Value must be positive
        // [GIVEN] A contract
        SalesContract.Init();
        SalesContract."Customer No." := CreateCustomer();
        SalesContract."Start Date" := WorkDate();
        SalesContract."End Date" := CalcDate('<+1Y>', WorkDate());

        // [WHEN] We set negative value
        // [THEN] Error is raised
        asserterror SalesContract.Validate("Contract Value", -1000);
        Assert.ExpectedError('Contract Value must be positive');
    end;

    [Test]
    procedure TestOnInsertTrigger()
    var
        SalesContract: Record "Sales Contract";
    begin
        // [SCENARIO] OnInsert trigger sets default values
        // [GIVEN] A new contract
        SalesContract.Init();
        SalesContract."Customer No." := CreateCustomer();
        SalesContract."Start Date" := WorkDate();
        SalesContract."End Date" := CalcDate('<+1Y>', WorkDate());

        // [WHEN] We insert
        SalesContract.Insert(true);

        // [THEN] Default status is Draft
        Assert.AreEqual(SalesContract.Status::Draft, SalesContract.Status, 'Default status should be Draft');

        // Cleanup
        SalesContract.Delete();
    end;

    [Test]
    procedure TestOnModifyTrigger()
    var
        SalesContract: Record "Sales Contract";
        OriginalValue: Decimal;
    begin
        // [SCENARIO] OnModify trigger validates changes
        // [GIVEN] An existing contract
        SalesContract.Init();
        SalesContract."Customer No." := CreateCustomer();
        SalesContract."Start Date" := WorkDate();
        SalesContract."End Date" := CalcDate('<+1Y>', WorkDate());
        SalesContract."Contract Value" := 1000;
        SalesContract.Insert(true);
        OriginalValue := SalesContract."Contract Value";

        // [WHEN] We modify the contract value
        SalesContract."Contract Value" := 2000;
        SalesContract.Modify(true);

        // [THEN] Modification is logged (audit)
        // Note: Actual audit logging would need additional verification

        // Cleanup
        SalesContract.Delete();
    end;

    local procedure CreateCustomer(): Code[20]
    var
        Customer: Record Customer;
    begin
        LibrarySales.CreateCustomer(Customer);
        exit(Customer."No.");
    end;
}
